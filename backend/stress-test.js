import fs from 'node:fs';
import path from 'node:path';
import ProxyHost from './models/proxy_host.js';
import utils from './lib/utils.js';

async function runTests() {
    console.log("====================================================");
    console.log("    STARTING 'STONE-BREAKER' STRESS TEST SUITE     ");
    console.log("====================================================\n");
    
    const results = {
        test1: { passed: false, details: [] },
        test2: { passed: false, details: [] },
        test3: { passed: false, details: [] }
    };
    
    // ====================================================
    // TEST 1: Advanced Configuration Fuzzer (reuseport stripping)
    // ====================================================
    console.log("----------------------------------------------------");
    console.log("TEST 1: Advanced Configuration Fuzzer (reuseport)");
    console.log("----------------------------------------------------");
    
    const fuzzerRegex = /(listen\s+[^;]*)\breuseport\s*(;?)/gi;
    const testCasesT1 = [
        {
            name: "Standard single directive with semicolon",
            input: "listen 443 ssl reuseport;",
            expected: "listen 443 ssl ;"
        },
        {
            name: "Directive with multiple options and semicolon",
            input: "listen [::]:443 ssl reuseport default_server;",
            expected: "listen [::]:443 ssl  default_server;"
        },
        {
            name: "Directive with reuseport in the middle",
            input: "listen 443 reuseport ssl;",
            expected: "listen 443  ssl;"
        },
        {
            name: "Unrelated directive (must be untouched)",
            input: "listen 80;",
            expected: "listen 80;"
        },
        {
            name: "Multi-line config mix",
            input: "listen 443 ssl reuseport;\nlisten [::]:443 ssl reuseport;\nproxy_pass http://upstream;",
            expected: "listen 443 ssl ;\nlisten [::]:443 ssl ;\nproxy_pass http://upstream;"
        }
    ];
    
    let t1AllPassed = true;
    const normalizeSpace = (str) => str.replace(/\s+/g, ' ').trim();
    
    for (const tc of testCasesT1) {
        const output = tc.input.replace(fuzzerRegex, '$1$2');
        const match = normalizeSpace(output) === normalizeSpace(tc.expected);
        if (match) {
            results.test1.details.push(`✅ Passed: [${tc.name}]`);
            console.log(`✅ [PASS] ${tc.name}`);
        } else {
            t1AllPassed = false;
            results.test1.details.push(`❌ Failed: [${tc.name}] - Expected: "${tc.expected}", Got: "${output}"`);
            console.log(`❌ [FAIL] ${tc.name}`);
            console.log(`   - Input:    ${tc.input}`);
            console.log(`   - Expected: ${tc.expected}`);
            console.log(`   - Got:      ${output}`);
        }
    }
    results.test1.passed = t1AllPassed;
    
    // ====================================================
    // TEST 2: Objection.js Model Coercion & DB Downgrade Simulation
    // ====================================================
    console.log("\n----------------------------------------------------");
    console.log("TEST 2: Objection.js Model Coercion & Safe DB Writes");
    console.log("----------------------------------------------------");
    
    try {
        const host = new ProxyHost();
        let t2AllPassed = true;
        
        // Scenario A: DB read missing http3_support (Downgrade/Rollback simulation)
        const dbPayload = { id: 42, enabled: 1, domain_names: '["test.com"]' };
        const parsed = host.$parseDatabaseJson(dbPayload);
        if (parsed.http3_support === 0) {
            results.test2.details.push("✅ Passed: [Scenario A] Safe default value http3_support=0 successfully injected when missing in DB payload.");
            console.log("✅ [PASS] Scenario A: Safe default (http3_support=0) injected on missing DB column.");
        } else {
            t2AllPassed = false;
            results.test2.details.push(`❌ Failed: [Scenario A] Expected http3_support to default to 0, got: ${parsed.http3_support}`);
            console.log(`❌ [FAIL] Scenario A: Missing column default was not set correctly (got: ${parsed.http3_support})`);
        }
        
        // Scenario B: Boolean coercion on active save/insert
        const activePayload = { http3_support: true, enabled: true };
        const formattedB = host.$formatDatabaseJson(activePayload);
        if (formattedB.http3_support === 1) {
            results.test2.details.push("✅ Passed: [Scenario B] http3_support true successfully coerced to database integer 1.");
            console.log("✅ [PASS] Scenario B: Coerced true -> 1");
        } else {
            t2AllPassed = false;
            results.test2.details.push(`❌ Failed: [Scenario B] Expected http3_support to coerce to 1, got: ${formattedB.http3_support}`);
            console.log(`❌ [FAIL] Scenario B: Coerce true -> 1 failed (got: ${formattedB.http3_support})`);
        }
        
        // Scenario C: Safe PATCH operation (Phantom column check)
        const patchPayload = { enabled: true }; // http3_support is omitted
        const formattedC = host.$formatDatabaseJson(patchPayload);
        if (formattedC.http3_support === undefined) {
            results.test2.details.push("✅ Passed: [Scenario C] Safe PATCH execution verified. http3_support is not injected as phantom column.");
            console.log("✅ [PASS] Scenario C: http3_support omitted on partial PATCH updates.");
        } else {
            t2AllPassed = false;
            results.test2.details.push(`❌ Failed: [Scenario C] http3_support was phantom-injected: ${formattedC.http3_support}`);
            console.log(`❌ [FAIL] Scenario C: Phantom column injected (got: ${formattedC.http3_support})`);
        }
        
        results.test2.passed = t2AllPassed;
    } catch (err) {
        results.test2.passed = false;
        results.test2.details.push(`❌ Failed: Exception occurred during model testing: ${err.message}\n${err.stack}`);
        console.log(`❌ [FAIL] Test 2 threw exception: ${err.message}`);
        console.error(err);
    }
    
    // ====================================================
    // TEST 3: Template Engine Scoping Rules
    // ====================================================
    console.log("\n----------------------------------------------------");
    console.log("TEST 3: Nginx Template Engine Scoping & Port Guards");
    console.log("----------------------------------------------------");
    
    try {
        const renderEngine = utils.getRenderEngine();
        const templatePath = path.join(process.cwd(), 'templates', '_listen.conf');
        const template = fs.readFileSync(templatePath, 'utf8');
        
        let t3AllPassed = true;
        
        // Scenario A: Standard Port 80 HTTP-Only Host Block (no cert)
        const httpOnlyContext = {
            ipv6: true,
            certificate: null,
            http3_support: true,
            domain_names: ["http.example.com"]
        };
        const httpOnlyRender = await renderEngine.parseAndRender(template, httpOnlyContext);
        const hasQuicHttpOnly = httpOnlyRender.includes("quic") || httpOnlyRender.includes("443");
        
        if (!hasQuicHttpOnly) {
            results.test3.details.push("✅ Passed: [Scenario A] Template cleanly suppressed all QUIC / port 443 listen blocks on HTTP-only host.");
            console.log("✅ [PASS] Scenario A: Cleanly suppressed QUIC on standard Port 80 host.");
        } else {
            t3AllPassed = false;
            results.test3.details.push(`❌ Failed: [Scenario A] Template emitted QUIC directives on HTTP-only block! Rendered:\n${httpOnlyRender}`);
            console.log("❌ [FAIL] Scenario A: QUIC leaked into HTTP-only block!");
        }
        
        // Scenario B: HTTPS Host with HTTP/3 Opt-in
        const httpsContext = {
            ipv6: true,
            certificate: { id: 1 },
            http3_support: true,
            domain_names: ["secure.example.com"]
        };
        const httpsRender = await renderEngine.parseAndRender(template, httpsContext);
        const hasQuicHttps = httpsRender.includes("443 quic") && httpsRender.includes("[::]:443 quic");
        
        if (hasQuicHttps) {
            results.test3.details.push("✅ Passed: [Scenario B] Template successfully rendered active parallel IPv4/IPv6 QUIC socket listeners on port 443.");
            console.log("✅ [PASS] Scenario B: Successfully rendered parallel QUIC listeners on SSL host.");
        } else {
            t3AllPassed = false;
            results.test3.details.push(`❌ Failed: [Scenario B] Expected parallel QUIC listeners, but they were missing! Rendered:\n${httpsRender}`);
            console.log("❌ [FAIL] Scenario B: Parallel QUIC listeners missing on SSL host.");
        }
        
        results.test3.passed = t3AllPassed;
    } catch (err) {
        results.test3.passed = false;
        results.test3.details.push(`❌ Failed: Exception occurred during template testing: ${err.message}\n${err.stack}`);
        console.log(`❌ [FAIL] Test 3 threw exception: ${err.message}`);
        console.error(err);
    }
    
    // ====================================================
    // CREATE EVALUATION REPORT
    // ====================================================
    console.log("\n====================================================");
    console.log("          ALL TESTS EXECUTED SUCCESSFULLY           ");
    console.log("====================================================\n");
    
    const allPassed = results.test1.passed && results.test2.passed && results.test3.passed;
    
    let report = `# Stone-Breaker Stress Protocol Evaluation Report\n\n`;
    report += `**Timestamp**: ${new Date().toISOString()}\n`;
    report += `**Overall Evaluation Result**: ${allPassed ? "✅ SUCCESS / ALL PASSED" : "❌ FAILURE / BUGS DETECTED"}\n\n`;
    
    report += `## Test 1: Advanced Configuration Fuzzer (reuseport)\n`;
    report += `**Result**: ${results.test1.passed ? "PASS" : "FAIL"}\n`;
    report += `### Details:\n`;
    results.test1.details.forEach(d => { report += `- ${d}\n`; });
    
    report += `\n## Test 2: Objection.js Model Coercion & Safe DB Writes\n`;
    report += `**Result**: ${results.test2.passed ? "PASS" : "FAIL"}\n`;
    report += `### Details:\n`;
    results.test2.details.forEach(d => { report += `- ${d}\n`; });
    
    report += `\n## Test 3: Nginx Template Engine Scoping & Port Guards\n`;
    report += `**Result**: ${results.test3.passed ? "PASS" : "FAIL"}\n`;
    report += `### Details:\n`;
    results.test3.details.forEach(d => { report += `- ${d}\n`; });
    
    report += `\n---\n*Report generated automatically by the Antigravity 'Stone-Breaker' Stress Protocol Runner.*`;
    
    fs.writeFileSync('/app/http3_stress_protocol.md', report, 'utf8');
    console.log("Stone-Breaker Stress Protocol evaluation results successfully saved to /app/http3_stress_protocol.md");
}

runTests();

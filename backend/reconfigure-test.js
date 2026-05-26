import proxyHostModel from './models/proxy_host.js';
import internalNginx from './internal/nginx.js';


async function testReconfigure() {
    console.log("====================================================");
    console.log("    RUNNING LOCAL SANDBOX E2E API VERIFICATION      ");
    console.log("====================================================\n");
    
    try {
        console.log("1. Fetching Proxy Host 1 from the live database...");
        const host = await proxyHostModel.query().findById(1).withGraphFetched('[owner,certificate,access_list]');
        
        console.log(`   - Current Host: ${host.domain_names.join(', ')}`);
        console.log(`   - http3_support flag: ${host.http3_support}`);
        
        console.log("\n2. Triggering Nginx configuration re-generation...");
        // Re-run the Nginx renderer
        await internalNginx.configure(proxyHostModel, "proxy_host", host);
        console.log("   - Configuration re-generated successfully!");
        
        console.log("\n3. Verifying the public HTTPS port advertisement...");
        console.log(`   - Public HTTPS Port Env Var: ${process.env.NPM_PUBLIC_HTTPS_PORT}`);
        
        const configPath = "/data/nginx/proxy_host/1.conf";
        const content = fs.readFileSync(configPath, 'utf8');
        
        const hasCustomPort = content.includes('h3=":4433"');
        const hasQuic = content.includes('listen 443 quic') && content.includes('http3 on;');
        
        console.log("\n-----------------------------");
        console.log("      SANDBOX METRICS        ");
        console.log("-----------------------------");
        if (hasQuic) {
            console.log("✅ Parallel listen 443 quic; direct sockets verified!");
        } else {
            console.log("❌ QUIC listen directives missing!");
        }
        
        if (hasCustomPort) {
            console.log("✅ Alt-Svc header correctly shifted to advertised port 4433: h3=\":4433\"!");
        } else {
            console.log("❌ Alt-Svc header is NOT advertising the custom port 4433!");
        }
        console.log("-----------------------------\n");
        
    } catch (err) {
        console.error("❌ Sandbox testing failed with error:", err.message);
        console.error(err.stack);
    }
}

// Import fs dynamically to match ESM style
import fs from 'node:fs';
testReconfigure();

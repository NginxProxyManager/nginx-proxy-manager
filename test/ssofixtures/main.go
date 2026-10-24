// ssofixtures is a standalone HTTPS OIDC provider for browser E2E tests.
// Example: go run . --listen 127.0.0.1:0 --cert-out /tmp/idp.crt --key-out /tmp/idp.key
package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"flag"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"net/url"
	"os"
	"time"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:0", "loopback listen address")
	allowNonLoopback := flag.Bool("allow-non-loopback", false, "allow container-network listeners (test environments only)")
	certOut := flag.String("cert-out", "", "write process-scoped CA certificate here")
	keyOut := flag.String("key-out", "", "write process-scoped TLS private key here")
	scenario := flag.String("case", "valid", "OIDC result: valid, signature, issuer, audience, azp, nonce, expired, userinfo_subject, email_array, email_missing, rotation")
	protocol := flag.String("protocol", "oidc", "fixture protocol: oidc, oauth2 or saml")
	canonicalIssuer := flag.String("issuer-url", "", "optional canonical HTTPS origin, e.g. https://idp.test:9443 (listener remains loopback)")
	spEntityID := flag.String("sp-entity-id", "", "SAML SP entity URI")
	acsURL := flag.String("acs-url", "", "SAML SP HTTPS ACS URL")
	spCertPath := flag.String("sp-certificate", "", "SAML SP public PEM certificate; when set require signed Redirect requests")
	clientID := flag.String("client-id", "", "OAuth client ID (random if omitted)")
	clientSecret := flag.String("client-secret", "", "OAuth client secret (random if omitted)")
	flag.Parse()
	if (*protocol != "oidc" && *protocol != "oauth2" && *protocol != "saml") || (*protocol == "oidc" && !validCase(*scenario)) || (*protocol == "oauth2" && !validOAuth2Case(*scenario)) || (*protocol == "saml" && !validSAMLCase(*scenario)) {
		fmt.Fprintln(os.Stderr, "unsupported --case")
		os.Exit(2)
	}
	if *clientID == "" {
		*clientID = randomCredential()
	}
	if *clientSecret == "" {
		*clientSecret = randomCredential()
	}
	if *certOut == "" || *keyOut == "" {
		fmt.Fprintln(os.Stderr, "--cert-out and --key-out required")
		os.Exit(2)
	}
	listener, err := net.Listen("tcp", *listen)
	if err != nil {
		panic(err)
	}
	if !*allowNonLoopback && (listener.Addr().(*net.TCPAddr).IP == nil || !listener.Addr().(*net.TCPAddr).IP.IsLoopback()) {
		panic("loopback listener required")
	}
	issuer := "https://" + listener.Addr().String()
	dnsNames := []string{"localhost"}
	if *canonicalIssuer != "" {
		parsed, err := url.Parse(*canonicalIssuer)
		if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.Opaque != "" || parsed.ForceQuery {
			panic("issuer-url must be a canonical HTTPS origin")
		}
		issuer = *canonicalIssuer
		dnsNames = append(dnsNames, parsed.Hostname())
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		panic(err)
	}
	certDER, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "npm-sso-fixture"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(24 * time.Hour), DNSNames: dnsNames, IPAddresses: []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}, &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "npm-sso-fixture"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(24 * time.Hour), DNSNames: dnsNames, IPAddresses: []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}, &key.PublicKey, key)
	if err != nil {
		panic(err)
	}
	certPEM := pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certDER})
	keyPEM := pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)})
	if err := os.WriteFile(*certOut, certPEM, 0600); err != nil {
		panic(err)
	}
	if err := os.WriteFile(*keyOut, keyPEM, 0600); err != nil {
		panic(err)
	}
	cert, err := tls.X509KeyPair(certPEM, keyPEM)
	if err != nil {
		panic(err)
	}
	var handler http.Handler
	startup := map[string]string{"issuer_url": issuer, "client_id": *clientID, "client_secret": *clientSecret, "ca_cert": *certOut, "case": *scenario, "protocol": *protocol}
	if *protocol == "saml" {
		entity, entityErr := url.Parse(*spEntityID)
		acs, acsErr := url.Parse(*acsURL)
		if entityErr != nil || entity.Scheme == "" || acsErr != nil || acs.Scheme != "https" || acs.Hostname() == "" || acs.User != nil || acs.Fragment != "" || acs.RawQuery != "" {
			panic("SAML requires --sp-entity-id and --acs-url")
		}
		fixture := newSAMLFixture(issuer, *spEntityID, *acsURL, *scenario, nil)
		// The SP certificate is public trust material published after metadata
		// preview creates NPM's signing key. Require signatures from startup and
		// load this file for every request; an absent/invalid file fails closed.
		fixture.spCertificatePath = *spCertPath
		handler = fixture.routes()
		delete(startup, "client_id")
		delete(startup, "client_secret")
		startup["idp_metadata_url"] = issuer + "/metadata"
		startup["sp_entity_id"] = *spEntityID
		startup["acs_url"] = *acsURL
	} else if *protocol == "oauth2" {
		handler = newOAuth2Fixture(issuer, *clientID, *clientSecret, *scenario).routes()
		startup["authorization_url"] = issuer + "/auth"
		startup["token_url"] = issuer + "/token"
		startup["userinfo_url"] = issuer + "/user"
	} else {
		handler = newOIDCFixture(issuer, *clientID, *clientSecret, *scenario).routes()
	}
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second, TLSConfig: &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}}
	_ = json.NewEncoder(os.Stdout).Encode(startup)
	if err := server.ServeTLS(listener, "", ""); err != nil && err != http.ErrServerClosed {
		panic(err)
	}
}

func randomCredential() string {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		panic(err)
	}
	return base64.RawURLEncoding.EncodeToString(value)
}

func validCase(value string) bool {
	switch value {
	case "valid", "signature", "issuer", "audience", "azp", "nonce", "expired", "userinfo_subject", "email_array", "email_missing", "rotation":
		return true
	}
	return false
}

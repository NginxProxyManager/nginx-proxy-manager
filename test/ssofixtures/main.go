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
	"os"
	"time"
)

func main() {
	listen := flag.String("listen", "127.0.0.1:0", "loopback listen address")
	certOut := flag.String("cert-out", "", "write process-scoped CA certificate here")
	keyOut := flag.String("key-out", "", "write process-scoped TLS private key here")
	scenario := flag.String("case", "valid", "OIDC result: valid, signature, issuer, audience, azp, nonce, expired, userinfo_subject, email_array, email_missing, rotation")
	clientID := flag.String("client-id", "", "OAuth client ID (random if omitted)")
	clientSecret := flag.String("client-secret", "", "OAuth client secret (random if omitted)")
	flag.Parse()
	if !validCase(*scenario) {
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
	if listener.Addr().(*net.TCPAddr).IP == nil || !listener.Addr().(*net.TCPAddr).IP.IsLoopback() {
		panic("loopback listener required")
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		panic(err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		panic(err)
	}
	certDER, err := x509.CreateCertificate(rand.Reader, &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "npm-sso-fixture"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(24 * time.Hour), DNSNames: []string{"localhost"}, IPAddresses: []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}, &x509.Certificate{SerialNumber: serial, Subject: pkix.Name{CommonName: "npm-sso-fixture"}, NotBefore: time.Now().Add(-time.Minute), NotAfter: time.Now().Add(24 * time.Hour), DNSNames: []string{"localhost"}, IPAddresses: []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}, &key.PublicKey, key)
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
	issuer := "https://" + listener.Addr().String()
	fixture := newOIDCFixture(issuer, *clientID, *clientSecret, *scenario)
	server := &http.Server{Handler: fixture.routes(), ReadHeaderTimeout: 5 * time.Second, TLSConfig: &tls.Config{Certificates: []tls.Certificate{cert}, MinVersion: tls.VersionTLS12}}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]string{"issuer_url": issuer, "client_id": *clientID, "client_secret": *clientSecret, "ca_cert": *certOut, "case": *scenario})
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

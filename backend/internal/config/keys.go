package config

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/asn1"
	"encoding/pem"
	"fmt"
	"io/ioutil"
	"os"

	"npm/internal/logger"
)

var keysFolder string
var publicKeyFile string
var privateKeyFile string

func loadKeys() {
	// check if keys folder exists in data folder
	keysFolder = fmt.Sprintf("%s/keys", Configuration.DataFolder)
	publicKeyFile = fmt.Sprintf("%s/public.key", keysFolder)
	privateKeyFile = fmt.Sprintf("%s/private.key", keysFolder)

	if _, err := os.Stat(keysFolder); os.IsNotExist(err) {
		// nolint:errcheck,gosec
		os.Mkdir(keysFolder, 0700)
	}

	// check if keys exist on disk
	_, publicKeyErr := os.Stat(publicKeyFile)
	_, privateKeyErr := os.Stat(privateKeyFile)

	// generate keys if either one doesn't exist
	if os.IsNotExist(publicKeyErr) || os.IsNotExist(privateKeyErr) {
		generateKeys()
		saveKeys()
	}

	// Load keys from disk
	// nolint:gosec
	publicKeyBytes, publicKeyBytesErr := ioutil.ReadFile(publicKeyFile)
	// nolint:gosec
	privateKeyBytes, privateKeyBytesErr := ioutil.ReadFile(privateKeyFile)
	PublicKey = string(publicKeyBytes)
	PrivateKey = string(privateKeyBytes)

	if isError("PublicKeyReadError", publicKeyBytesErr) || isError("PrivateKeyReadError", privateKeyBytesErr) || PublicKey == "" || PrivateKey == "" {
		logger.Warn("There was an error loading keys, proceeding to generate new RSA keys")
		generateKeys()
		saveKeys()
	}
}

func generateKeys() {
	reader := rand.Reader
	bitSize := 4096

	key, err := rsa.GenerateKey(reader, bitSize)
	if isError("RSAGenerateError", err) {
		return
	}

	privateKey := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}

	privateKeyBuffer := new(bytes.Buffer)
	err = pem.Encode(privateKeyBuffer, privateKey)
	if isError("PrivatePEMEncodeError", err) {
		return
	}

	asn1Bytes, err2 := asn1.Marshal(key.PublicKey)
	if isError("RSAMarshalError", err2) {
		return
	}

	publicKey := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: asn1Bytes,
	}

	publicKeyBuffer := new(bytes.Buffer)
	err = pem.Encode(publicKeyBuffer, publicKey)
	if isError("PublicPEMEncodeError", err) {
		return
	}

	PublicKey = publicKeyBuffer.String()
	PrivateKey = privateKeyBuffer.String()
	logger.Info("Generated new RSA keys")
}

func saveKeys() {
	err := ioutil.WriteFile(publicKeyFile, []byte(PublicKey), 0600)
	if err != nil {
		logger.Error("PublicKeyWriteError", err)
	} else {
		logger.Info("Saved Public Key: %s", publicKeyFile)
	}

	err = ioutil.WriteFile(privateKeyFile, []byte(PrivateKey), 0600)
	if err != nil {
		logger.Error("PrivateKeyWriteError", err)
	} else {
		logger.Info("Saved Private Key: %s", privateKeyFile)
	}
}

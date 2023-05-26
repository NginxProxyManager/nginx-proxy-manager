package jwt

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/asn1"
	"encoding/pem"

	"npm/internal/logger"

	"github.com/rotisserie/eris"
)

var (
	privateKey *rsa.PrivateKey
	publicKey  *rsa.PublicKey
)

// GetPrivateKey will load the key from config package and return a usable object
// It should only load from file once per program execution
func GetPrivateKey() (*rsa.PrivateKey, error) {
	if privateKey == nil {
		var blankKey *rsa.PrivateKey

		if currentKeys.PrivateKey == "" {
			return blankKey, eris.New("Could not get Private Key from configuration")
		}

		var err error
		privateKey, err = LoadPemPrivateKey(currentKeys.PrivateKey)
		if err != nil {
			return blankKey, err
		}
	}

	pub, pubErr := GetPublicKey()
	if pubErr != nil {
		return privateKey, pubErr
	}

	privateKey.PublicKey = *pub

	return privateKey, pubErr
}

// GetPublicKey will load the key from config package and return a usable object
// It should only load once per program execution
func GetPublicKey() (*rsa.PublicKey, error) {
	if publicKey == nil {
		var blankKey *rsa.PublicKey

		if currentKeys.PublicKey == "" {
			return blankKey, eris.New("Could not get Public Key from configuration")
		}

		var err error
		publicKey, err = LoadPemPublicKey(currentKeys.PublicKey)
		if err != nil {
			return blankKey, err
		}
	}

	return publicKey, nil
}

// LoadPemPrivateKey reads a key from a PEM encoded string and returns a private key
func LoadPemPrivateKey(content string) (*rsa.PrivateKey, error) {
	var key *rsa.PrivateKey
	data, _ := pem.Decode([]byte(content))
	var err error
	key, err = x509.ParsePKCS1PrivateKey(data.Bytes)
	if err != nil {
		return key, err
	}
	return key, nil
}

// LoadPemPublicKey reads a key from a PEM encoded string and returns a public key
func LoadPemPublicKey(content string) (*rsa.PublicKey, error) {
	var key *rsa.PublicKey
	data, _ := pem.Decode([]byte(content))
	publicKeyFileImported, err := x509.ParsePKCS1PublicKey(data.Bytes)
	if err != nil {
		return key, err
	}

	return publicKeyFileImported, nil
}

func generateKeys() (KeysModel, error) {
	m := KeysModel{}
	reader := rand.Reader
	bitSize := 4096

	key, err := rsa.GenerateKey(reader, bitSize)
	if err != nil {
		return m, err
	}

	privateKey := &pem.Block{
		Type:  "PRIVATE KEY",
		Bytes: x509.MarshalPKCS1PrivateKey(key),
	}

	privateKeyBuffer := new(bytes.Buffer)
	err = pem.Encode(privateKeyBuffer, privateKey)
	if err != nil {
		return m, err
	}

	asn1Bytes, err := asn1.Marshal(key.PublicKey)
	if err != nil {
		return m, err
	}

	publicKey := &pem.Block{
		Type:  "PUBLIC KEY",
		Bytes: asn1Bytes,
	}

	publicKeyBuffer := new(bytes.Buffer)
	err = pem.Encode(publicKeyBuffer, publicKey)
	if err != nil {
		return m, err
	}

	m.PublicKey = publicKeyBuffer.String()
	m.PrivateKey = privateKeyBuffer.String()

	logger.Info("Generated new RSA keys")

	return m, nil
}

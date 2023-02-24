package jwt

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"

	"npm/internal/config"

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

		if config.PrivateKey == "" {
			return blankKey, eris.New("Could not get Private Key from configuration")
		}

		var err error
		privateKey, err = LoadPemPrivateKey(config.PrivateKey)
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

		if config.PublicKey == "" {
			return blankKey, eris.New("Could not get Public Key filename, check environment variables")
		}

		var err error
		publicKey, err = LoadPemPublicKey(config.PublicKey)
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

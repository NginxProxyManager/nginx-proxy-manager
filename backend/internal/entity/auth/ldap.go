package auth

import (
	"encoding/json"
	"fmt"
	"strings"

	"npm/internal/entity/setting"
	"npm/internal/logger"

	ldap3 "github.com/go-ldap/ldap/v3"
	"github.com/rotisserie/eris"
)

// LDAPUser is the LDAP User
type LDAPUser struct {
	Username string `json:"username"`
	Name     string `json:"name"`
	Email    string `json:"email"`
}

// LDAPAuthenticate will use ldap to authenticate with user/pass
func LDAPAuthenticate(identity, password string) (*LDAPUser, error) {
	ldapSettings, err := setting.GetLDAPSettings()
	if err != nil {
		return nil, err
	}

	dn := strings.Replace(ldapSettings.UserDN, "{{USERNAME}}", identity, 1)
	conn, err := ldapConnect(ldapSettings.Host, dn, password)
	if err != nil {
		return nil, err
	}
	// nolint: errcheck, gosec
	defer conn.Close()
	return ldapSearchUser(conn, ldapSettings, identity)
}

// Attempt ldap connection
func ldapConnect(host, dn, password string) (*ldap3.Conn, error) {
	var conn *ldap3.Conn
	var err error

	if conn, err = ldap3.DialURL(fmt.Sprintf("ldap://%s", host)); err != nil {
		logger.Error("LdapError", err)
		return nil, err
	}

	logger.Debug("LDAP Logging in with: %s", dn)
	if err := conn.Bind(dn, password); err != nil {
		if !strings.Contains(err.Error(), "Invalid Credentials") {
			logger.Error("LDAPAuthError", err)
		}
		// nolint: gosec, errcheck
		conn.Close()
		return nil, err
	}

	logger.Debug("LDAP Login Successful")
	return conn, nil
}

func ldapSearchUser(l *ldap3.Conn, ldapSettings setting.LDAPSettings, username string) (*LDAPUser, error) {
	// Search for the given username
	searchRequest := ldap3.NewSearchRequest(
		ldapSettings.BaseDN,
		ldap3.ScopeWholeSubtree,
		ldap3.NeverDerefAliases,
		0,
		0,
		false,
		strings.Replace(ldapSettings.SelfFilter, "{{USERNAME}}", username, 1),
		nil, // []string{"name"},
		nil,
	)

	sr, err := l.Search(searchRequest)
	if err != nil {
		logger.Error("LdapError", err)
		return nil, err
	}

	if len(sr.Entries) < 1 {
		return nil, eris.New("No user found in LDAP search")
	} else if len(sr.Entries) > 1 {
		j, _ := json.Marshal(sr)
		logger.Debug("LDAP Search Results: %s", j)
		return nil, eris.Errorf("Too many LDAP results returned in LDAP search: %d", len(sr.Entries))
	}

	return &LDAPUser{
		Username: strings.ToLower(username),
		Name:     sr.Entries[0].GetAttributeValue(ldapSettings.NameProperty),
		Email:    strings.ToLower(sr.Entries[0].GetAttributeValue(ldapSettings.EmailProperty)),
	}, nil
}

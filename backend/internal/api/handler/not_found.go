package handler

import (
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"npm/embed"
	h "npm/internal/api/http"

	"github.com/rotisserie/eris"
)

var (
	assetsSub fs.FS
	errIsDir  = eris.New("path is dir")
)

// NotFound is a json error handler for 404's and method not allowed.
// It also serves the react frontend as embedded files in the golang binary.
func NotFound() func(http.ResponseWriter, *http.Request) {
	assetsSub, _ = fs.Sub(embed.Assets, "assets")

	return func(w http.ResponseWriter, r *http.Request) {
		defaultFile := "index.html"
		path := strings.TrimLeft(r.URL.Path, "/")

		isAPI := false
		if len(path) >= 3 && path[0:3] == "api" {
			isAPI = true
		}

		if path == "" {
			path = defaultFile
		}

		err := tryRead(assetsSub, path, w)
		if err == errIsDir {
			err = tryRead(assetsSub, defaultFile, w)
			if err != nil {
				h.NotFound(w, r)
			}
		} else if err == nil {
			return
		}

		// Check if the path has an extension and not in the "/api" path
		ext := filepath.Ext(path)
		if !isAPI && ext == "" {
			// Not an api endpoint and Not a specific file, return the default index file
			err := tryRead(assetsSub, defaultFile, w)
			if err == nil {
				return
			}
		}

		h.NotFound(w, r)
	}
}

func tryRead(folder fs.FS, requestedPath string, w http.ResponseWriter) error {
	f, err := folder.Open(requestedPath)
	if err != nil {
		return err
	}

	// nolint: errcheck
	defer f.Close()

	stat, _ := f.Stat()
	if stat.IsDir() {
		return errIsDir
	}

	contentType := mime.TypeByExtension(filepath.Ext(requestedPath))
	w.Header().Set("Content-Type", contentType)
	_, err = io.Copy(w, f)
	return err
}

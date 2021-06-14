package handler

import (
	"embed"
	"errors"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	h "npm/internal/api/http"
)

//go:embed assets
var assets embed.FS
var assetsSub fs.FS

var errIsDir = errors.New("path is dir")

// NotFound is a json error handler for 404's and method not allowed.
// It also serves the react frontend as embedded files in the golang binary.
func NotFound() func(http.ResponseWriter, *http.Request) {
	assetsSub, _ = fs.Sub(assets, "assets")

	return func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimLeft(r.URL.Path, "/")
		if path == "" {
			path = "index.html"
		}

		err := tryRead(assetsSub, path, w)
		if err == errIsDir {
			err = tryRead(assetsSub, "index.html", w)
			if err != nil {
				h.ResultErrorJSON(w, r, http.StatusNotFound, "Not found", nil)
			}
		} else if err == nil {
			return
		}

		h.ResultErrorJSON(w, r, http.StatusNotFound, "Not found", nil)
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

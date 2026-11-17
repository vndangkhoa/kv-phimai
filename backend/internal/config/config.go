package config

import (
	"os"
	"path/filepath"
	"strings"
)

type Config struct {
	Port              string
	DatabaseURL       string
	DataDir           string
	KVTubeURL         string // Base URL of a KV-Tube install (or any host serving /api/invidious + /companion)
	InvidiousUpstream string // Invidious API root (overrides KVTubeURL + "/api/invidious")
	CompanionURL      string // Invidious Companion base (serves /companion/...); defaults to the KV-Tube / Invidious host
	AllowedOrigins    []string
}

// Load reads configuration from the environment.
//
// The video backend is NOT bundled and has no default: self-hosters must point
// PhimAI at their own KV-Tube install, or at their own Invidious + Companion.
//
//	KVTUBE_URL=https://kvtube.example.com              # KV-Tube (provides /api/invidious and /companion)
//	INVIDIOUS_UPSTREAM=https://invidious.example.com   # plain Invidious API root
//	COMPANION_URL=https://invidious.example.com        # host that serves /companion/... (if different)
func Load() *Config {
	dataDir := getEnv("DATA_DIR", findDataDir())
	dbDefault := filepath.Join(dataDir, "phimai.db")
	kvtURL := trimURL(os.Getenv("KVTUBE_URL"))

	invidious := trimURL(os.Getenv("INVIDIOUS_UPSTREAM"))
	if invidious == "" && kvtURL != "" {
		invidious = kvtURL + "/api/invidious"
	}

	companion := trimURL(os.Getenv("COMPANION_URL"))
	if companion == "" {
		switch {
		case kvtURL != "":
			companion = kvtURL
		case invidious != "":
			// Plain Invidious usually exposes Companion on the same host under /companion
			companion = strings.TrimSuffix(invidious, "/api/invidious")
		}
	}

	return &Config{
		Port:              getEnv("PORT", "8090"),
		DatabaseURL:       getEnv("DATABASE_URL", dbDefault),
		DataDir:           dataDir,
		KVTubeURL:         kvtURL,
		InvidiousUpstream: invidious,
		CompanionURL:      companion,
		AllowedOrigins:    []string{"*"},
	}
}

func trimURL(raw string) string {
	return strings.TrimRight(strings.TrimSpace(raw), "/")
}

func findDataDir() string {
	candidates := []string{
		"data",
		"./data",
		"backend/data",
		"/app/data",
	}
	for _, c := range candidates {
		if info, err := os.Stat(filepath.Join(c, "manifest.json")); err == nil && !info.IsDir() {
			return c
		}
	}
	return "data"
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

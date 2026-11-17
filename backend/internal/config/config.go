package config

import (
	"os"
	"path/filepath"
)

type Config struct {
	Port           string
	DatabaseURL    string
	DataDir        string
	KVTubeURL      string
	AllowedOrigins []string
}

func Load() *Config {
	dataDir := getEnv("DATA_DIR", findDataDir())
	dbDefault := filepath.Join(dataDir, "phimai.db")

	return &Config{
		Port:           getEnv("PORT", "8090"),
		DatabaseURL:    getEnv("DATABASE_URL", dbDefault),
		DataDir:        dataDir,
		KVTubeURL:      getEnv("KVTUBE_URL", "https://u.khoavo.vndns.net"),
		AllowedOrigins: []string{"*"},
	}
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

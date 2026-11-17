package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"phimai-backend/internal/api"
	"phimai-backend/internal/catalog"
	"phimai-backend/internal/config"
	"phimai-backend/internal/database"
	"phimai-backend/internal/kvtube"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func main() {
	cfg := config.Load()

	db := database.InitDB(cfg.DatabaseURL, cfg.DataDir)
	cat := catalog.NewCatalog(cfg.DataDir, cfg.KVTubeURL)
	kvt := kvtube.NewService(cfg.CompanionURL, cfg.InvidiousUpstream)
	kvt.OnDeadVideo = cat.MarkDead
	handler := api.NewHandler(db, cat, kvt)

	crawlCtx, crawlCancel := context.WithCancel(context.Background())
	defer crawlCancel()
	go cat.StartAutoCrawler(crawlCtx, kvt, 30*time.Minute)

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "Range", "X-CSRF-Token", "X-Request-ID"},
		ExposedHeaders:   []string{"Link", "X-Request-ID", "Content-Length", "Content-Range", "Accept-Ranges"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	// API routes
	r.Route("/api", func(r chi.Router) {
		api.RegisterRoutes(r, handler)
	})

	// Safety net: also route /companion/* and /videoplayback* at root through same-origin proxy
	r.HandleFunc("/companion/*", func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/api/invidious" + r.URL.Path
		kvt.ProxyInvidious(w, r)
	})
	r.HandleFunc("/videoplayback", func(w http.ResponseWriter, r *http.Request) {
		r.URL.Path = "/api/invidious" + r.URL.Path
		kvt.ProxyInvidious(w, r)
	})

	// Static /data/* JSON catalog files
	dataFS := http.StripPrefix("/data/", http.FileServer(http.Dir(cfg.DataDir)))
	serveData := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Cache-Control", "public, max-age=3600")
		dataFS.ServeHTTP(w, r)
	}
	r.Get("/data/*", serveData)
	r.Head("/data/*", serveData)

	// SPA Frontend Static Server (dynamically resolves ../frontend/dist or ./dist)
	serveSPA := func(w http.ResponseWriter, r *http.Request) {
		frontendDir := resolveFrontendDir()
		if frontendDir == "" {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"service":"phimai","status":"backend-ready","message":"Frontend dist not built yet"}`))
			return
		}

		root := http.Dir(frontendDir)
		reqPath := r.URL.Path
		if reqPath == "" {
			reqPath = "/"
		}

		f, err := root.Open(reqPath)
		if err == nil {
			info, statErr := f.Stat()
			f.Close()
			if statErr == nil && !info.IsDir() {
				http.FileServer(root).ServeHTTP(w, r)
				return
			}
		}

		// Fallback to index.html for SPA routes (never redirect /index.html -> ./)
		indexFile, err := root.Open("/index.html")
		if err != nil {
			http.NotFound(w, r)
			return
		}
		defer indexFile.Close()

		info, err := indexFile.Stat()
		if err != nil {
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeContent(w, r, "index.html", info.ModTime(), indexFile)
	}
	r.Get("/*", serveSPA)
	r.Head("/*", serveSPA)

	srv := &http.Server{
		Addr:        ":" + cfg.Port,
		Handler:     r,
		ReadTimeout: 30 * time.Second,
		// WriteTimeout is 0 so long-running /api/kvtube/stream/{id} video streams never cut off
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("KV-PhimAI Backend starting on http://0.0.0.0:%s", cfg.Port)
		if kvt.IsConfigured() {
			log.Printf("Video backend: Invidious API %s | Companion %s", cfg.InvidiousUpstream, cfg.CompanionURL)
		} else {
			log.Printf("WARNING: no video backend configured — films can be browsed but not played.")
			log.Printf("         Set KVTUBE_URL (your KV-Tube) or INVIDIOUS_UPSTREAM + COMPANION_URL (your Invidious + Companion).")
		}
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down KV-PhimAI server...")
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
}

func resolveFrontendDir() string {
	workDir, _ := os.Getwd()
	candidates := []string{
		filepath.Join(workDir, "dist"),
		filepath.Join(workDir, "..", "frontend", "dist"),
		filepath.Join(workDir, "frontend", "dist"),
		"/mnt/data/Package Center/kv-phimai/frontend/dist",
		"/mnt/data/Projects/phimai/frontend/dist",
		"/app/dist",
	}
	for _, dir := range candidates {
		cleaned := filepath.Clean(dir)
		if strings.HasSuffix(cleaned, "dist") {
			if info, err := os.Stat(filepath.Join(cleaned, "index.html")); err == nil && !info.IsDir() {
				return cleaned
			}
		}
	}
	return ""
}

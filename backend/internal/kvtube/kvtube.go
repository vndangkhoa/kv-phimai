package kvtube

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"phimai-backend/internal/models"
)

type cachedVideo struct {
	data   models.KVTubeVideoResponse
	expiry time.Time
}

type cachedThumb struct {
	contentType string
	body        []byte
	expiry      time.Time
}

type Service struct {
	BaseURL      string
	apiClient    *http.Client
	streamClient *http.Client

	mu         sync.RWMutex
	videoCache map[string]cachedVideo
	thumbCache map[string]cachedThumb
}

func NewService(baseURL string) *Service {
	cleaned := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if cleaned == "" {
		cleaned = "https://u.khoavo.vndns.net"
	}

	// Transport with ResponseHeaderTimeout ONLY (no total body timeout so long streams never cut off!)
	streamTransport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 25 * time.Second,
	}

	return &Service{
		BaseURL: cleaned,
		apiClient: &http.Client{
			Timeout:   16 * time.Second,
			Transport: streamTransport,
		},
		streamClient: &http.Client{
			// Timeout: 0 is critical so streaming video bodies are never aborted after 30s!
			Timeout:   0,
			Transport: streamTransport,
		},
		videoCache: make(map[string]cachedVideo),
		thumbCache: make(map[string]cachedThumb),
	}
}

// RewriteStreamURL rewrites Invidious / Companion / googlevideo URLs so they route through
// https://u.khoavo.vndns.net/api/invidious/... preserving strict WARP stream IP-symmetry.
func (s *Service) RewriteStreamURL(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, s.BaseURL+"/api/invidious") {
		return trimmed
	}
	if strings.HasPrefix(trimmed, "/api/invidious") {
		return s.BaseURL + trimmed
	}
	if strings.HasPrefix(trimmed, "/") {
		return s.BaseURL + "/api/invidious" + trimmed
	}

	u, err := url.Parse(trimmed)
	if err != nil {
		return trimmed
	}

	host := strings.ToLower(u.Hostname())
	pathAndQuery := u.EscapedPath()
	if u.RawQuery != "" {
		pathAndQuery += "?" + u.RawQuery
	}

	if strings.HasPrefix(u.Path, "/api/invidious/") || u.Path == "/api/invidious" {
		return s.BaseURL + pathAndQuery
	}

	// Rewrite manifest.googlevideo.com through Companion
	if host == "manifest.googlevideo.com" {
		return s.BaseURL + "/api/invidious/companion" + pathAndQuery
	}

	// Rewrite *.googlevideo.com through Companion, preserving exact signed query params
	if host == "googlevideo.com" || strings.HasSuffix(host, ".googlevideo.com") {
		q := u.RawQuery
		if !strings.Contains(q, "host=") {
			if q != "" {
				q += "&host=" + url.QueryEscape(u.Host)
			} else {
				q = "host=" + url.QueryEscape(u.Host)
			}
		}
		return s.BaseURL + "/api/invidious/companion" + u.EscapedPath() + "?" + q
	}

	// Rewrite any Invidious / Companion media, manifest, captions, or playback paths on yt.khoavo.vndns.net or internal hosts
	if strings.HasPrefix(u.Path, "/api/") ||
		strings.HasPrefix(u.Path, "/companion/") ||
		strings.HasPrefix(u.Path, "/videoplayback") ||
		strings.HasPrefix(u.Path, "/latest_version") {
		if strings.HasPrefix(u.Path, "/api/manifest/") && !strings.Contains(u.RawQuery, "local=") {
			if u.RawQuery != "" {
				pathAndQuery += "&local=true"
			} else {
				pathAndQuery += "?local=true"
			}
		}
		return s.BaseURL + "/api/invidious" + pathAndQuery
	}

	return trimmed
}

func (s *Service) GetVideo(ctx context.Context, videoID string, fallback *models.Film, channelIDs map[string]string) models.KVTubeVideoResponse {
	s.mu.RLock()
	if cached, ok := s.videoCache[videoID]; ok && time.Now().Before(cached.expiry) {
		s.mu.RUnlock()
		return cached.data
	}
	s.mu.RUnlock()

	resp := models.KVTubeVideoResponse{
		ID:              videoID,
		WatchURL:        s.BaseURL + "/watch?v=" + videoID,
		EmbedURL:        s.BaseURL + "/embed/" + videoID,
		ThumbnailURL:    "/api/kvtube/thumb/" + videoID,
		DirectStreamURL: "/api/kvtube/stream/" + videoID,
		Streams:         []models.KVTubeStreamItem{},
		Captions:        []models.KVTubeCaption{},
	}

	if fallback != nil {
		resp.Title = fallback.Title
		resp.Author = fallback.Channel
		resp.ViewCount = fallback.ViewsNum
		resp.LengthSeconds = fallback.DurMins * 60
		if cid, ok := channelIDs[fallback.Channel]; ok && cid != "" {
			resp.AuthorID = cid
			resp.ChannelURL = s.BaseURL + "/channel/" + cid
		} else if fallback.Channel != "" {
			resp.ChannelURL = s.BaseURL + "/search?q=" + url.QueryEscape(fallback.Channel)
		}
	}

	apiURL := fmt.Sprintf("%s/api/invidious/api/v1/videos/%s?local=true", s.BaseURL, url.PathEscape(videoID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err == nil {
		req.Header.Set("Accept", "application/json")
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-PhimAI/1.0")
		httpResp, err := s.apiClient.Do(req)
		if err == nil {
			defer httpResp.Body.Close()
			if httpResp.StatusCode == http.StatusOK {
				var raw map[string]interface{}
				if json.NewDecoder(httpResp.Body).Decode(&raw) == nil {
					if t, ok := raw["title"].(string); ok && t != "" {
						resp.Title = t
					}
					if a, ok := raw["author"].(string); ok && a != "" {
						resp.Author = a
					}
					if aid, ok := raw["authorId"].(string); ok && aid != "" {
						resp.AuthorID = aid
						resp.ChannelURL = s.BaseURL + "/channel/" + aid
					}
					if ls := toInt(raw["lengthSeconds"]); ls > 0 {
						resp.LengthSeconds = ls
					}
					if vc := toInt64(raw["viewCount"]); vc > 0 {
						resp.ViewCount = vc
					}
					if hls, ok := raw["hlsUrl"].(string); ok && hls != "" {
						resp.HlsURL = s.RewriteStreamURL(hls)
					}
					if dash, ok := raw["dashUrl"].(string); ok && dash != "" {
						resp.DashURL = s.RewriteStreamURL(dash)
					}

					// Rewrite formatStreams
					if fsList, ok := raw["formatStreams"].([]interface{}); ok {
						for _, item := range fsList {
							m, ok := item.(map[string]interface{})
							if !ok {
								continue
							}
							rawURL, _ := m["url"].(string)
							if rawURL == "" {
								continue
							}
							rewritten := s.RewriteStreamURL(rawURL)
							m["url"] = rewritten
							resp.FormatStreams = append(resp.FormatStreams, m)

							qual, _ := m["qualityLabel"].(string)
							if qual == "" {
								qual, _ = m["quality"].(string)
							}
							if qual == "" {
								qual = "360p"
							}
							typ, _ := m["type"].(string)
							cont, _ := m["container"].(string)
							itag, _ := m["itag"].(string)
							resp.Streams = append(resp.Streams, models.KVTubeStreamItem{
								URL:          rewritten,
								Quality:      qual,
								QualityLabel: qual,
								Itag:         itag,
								Type:         typ,
								Container:    cont,
							})
						}
					}

					// Rewrite adaptiveFormats
					if afList, ok := raw["adaptiveFormats"].([]interface{}); ok {
						for _, item := range afList {
							m, ok := item.(map[string]interface{})
							if !ok {
								continue
							}
							rawURL, _ := m["url"].(string)
							if rawURL == "" {
								continue
							}
							rewritten := s.RewriteStreamURL(rawURL)
							m["url"] = rewritten
							resp.AdaptiveFormats = append(resp.AdaptiveFormats, m)
						}
					}

					// Rewrite captions
					if capList, ok := raw["captions"].([]interface{}); ok {
						for _, item := range capList {
							m, ok := item.(map[string]interface{})
							if !ok {
								continue
							}
							label, _ := m["label"].(string)
							lang, _ := m["languageCode"].(string)
							if lang == "" {
								lang, _ = m["language_code"].(string)
							}
							cURL, _ := m["url"].(string)
							if cURL != "" {
								resp.Captions = append(resp.Captions, models.KVTubeCaption{
									Label:        label,
									LanguageCode: lang,
									URL:          s.RewriteStreamURL(cURL),
								})
							}
						}
					}
				}
			}
		}
	}

	if resp.ChannelURL == "" {
		if resp.AuthorID != "" {
			resp.ChannelURL = s.BaseURL + "/channel/" + resp.AuthorID
		} else if resp.Author != "" {
			resp.ChannelURL = s.BaseURL + "/search?q=" + url.QueryEscape(resp.Author)
		} else {
			resp.ChannelURL = s.BaseURL
		}
	}

	// Ensure at least the KV-Tube latest_version proxy stream is present in streams
	latestVersionURL := fmt.Sprintf("%s/api/invidious/latest_version?id=%s&itag=18&local=true", s.BaseURL, url.QueryEscape(videoID))
	if len(resp.Streams) == 0 {
		resp.Streams = append(resp.Streams, models.KVTubeStreamItem{
			URL:          latestVersionURL,
			Quality:      "360p",
			QualityLabel: "360p",
			Itag:         "18",
			Type:         `video/mp4; codecs="avc1.42001E, mp4a.40.2"`,
			Container:    "mp4",
		})
	}
	// Always append our local Range-enabled proxy stream as a resilient option
	resp.Streams = append(resp.Streams, models.KVTubeStreamItem{
		URL:          "/api/kvtube/stream/" + videoID,
		Quality:      "360p (KV-Proxy)",
		QualityLabel: "360p (KV-Proxy)",
		Itag:         "18",
		Type:         "video/mp4",
		Container:    "mp4",
	})

	s.mu.Lock()
	s.videoCache[videoID] = cachedVideo{
		data:   resp,
		expiry: time.Now().Add(10 * time.Minute),
	}
	s.mu.Unlock()

	return resp
}

// ProxyStream streams video bytes from https://u.khoavo.vndns.net/api/invidious/latest_version
// with Range header support and response-header-only timeout so streams never cut off.
func (s *Service) ProxyStream(w http.ResponseWriter, r *http.Request, videoID string) {
	itag := r.URL.Query().Get("itag")
	if itag == "" {
		itag = "18"
	}

	upstreamURL := fmt.Sprintf("%s/api/invidious/latest_version?id=%s&itag=%s&local=true",
		s.BaseURL, url.QueryEscape(videoID), url.QueryEscape(itag))

	req, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL, nil)
	if err != nil {
		http.Error(w, `{"error":"invalid upstream request"}`, http.StatusBadGateway)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-PhimAI/1.0")
	req.Header.Set("Accept-Encoding", "identity")
	if rng := r.Header.Get("Range"); rng != "" {
		req.Header.Set("Range", rng)
	}

	resp, err := s.streamClient.Do(req)
	if err != nil {
		// Fallback redirect to u.khoavo.vndns.net stream URL if direct proxy fails
		http.Redirect(w, r, upstreamURL, http.StatusTemporaryRedirect)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		http.Redirect(w, r, upstreamURL, http.StatusTemporaryRedirect)
		return
	}

	for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "Cache-Control", "ETag"} {
		if val := resp.Header.Get(h); val != "" {
			w.Header().Set(h, val)
		}
	}
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "video/mp4")
	}
	if w.Header().Get("Accept-Ranges") == "" {
		w.Header().Set("Accept-Ranges", "bytes")
	}
	w.Header().Set("Access-Control-Allow-Origin", "*")

	w.WriteHeader(resp.StatusCode)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, resp.Body)
	}
}

// ProxyThumb proxies video thumbnails from https://u.khoavo.vndns.net/api/invidious/vi/{id}/hqdefault.jpg
// with fallback to maxresdefault.jpg / mqdefault.jpg and in-memory caching.
func (s *Service) ProxyThumb(w http.ResponseWriter, r *http.Request, videoID string) {
	quality := r.URL.Query().Get("q")
	if quality == "" {
		quality = "hqdefault"
	}
	cacheKey := videoID + ":" + quality

	s.mu.RLock()
	if cached, ok := s.thumbCache[cacheKey]; ok && time.Now().Before(cached.expiry) {
		s.mu.RUnlock()
		w.Header().Set("Content-Type", cached.contentType)
		w.Header().Set("Cache-Control", "public, max-age=86400")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(cached.body)
		return
	}
	s.mu.RUnlock()

	candidates := []string{
		fmt.Sprintf("%s/api/invidious/vi/%s/hqdefault.jpg", s.BaseURL, url.PathEscape(videoID)),
		fmt.Sprintf("%s/api/invidious/vi/%s/maxresdefault.jpg", s.BaseURL, url.PathEscape(videoID)),
		fmt.Sprintf("%s/api/invidious/vi/%s/mqdefault.jpg", s.BaseURL, url.PathEscape(videoID)),
	}

	for _, target := range candidates {
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			cancel()
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) KV-PhimAI/1.0")
		resp, err := s.apiClient.Do(req)
		if err != nil {
			cancel()
			continue
		}
		body, readErr := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024))
		resp.Body.Close()
		cancel()

		if readErr == nil && resp.StatusCode == http.StatusOK && len(body) > 512 {
			ct := resp.Header.Get("Content-Type")
			if ct == "" || strings.Contains(ct, "text/html") {
				ct = "image/jpeg"
			}
			s.mu.Lock()
			if len(s.thumbCache) > 800 {
				s.thumbCache = make(map[string]cachedThumb)
			}
			s.thumbCache[cacheKey] = cachedThumb{
				contentType: ct,
				body:        body,
				expiry:      time.Now().Add(6 * time.Hour),
			}
			s.mu.Unlock()

			w.Header().Set("Content-Type", ct)
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(body)
			return
		}
	}

	// Fallback sleek SVG poster so broken thumbnails never appear
	svg := fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270" width="480" height="270">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%%" stop-color="#12131c"/>
      <stop offset="100%%" stop-color="#1e1b2e"/>
    </linearGradient>
  </defs>
  <rect width="480" height="270" fill="url(#bg)"/>
  <circle cx="240" cy="120" r="32" fill="#e50914" fill-opacity="0.88"/>
  <polygon points="232,106 232,134 256,120" fill="#ffffff"/>
  <text x="240" y="185" fill="#ffd875" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">KV-PHIMAI CINEMA</text>
  <text x="240" y="210" fill="#9ca3af" font-family="monospace" font-size="12" text-anchor="middle">%s</text>
</svg>`, videoID)

	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(svg))
}

func toInt(v interface{}) int {
	switch val := v.(type) {
	case float64:
		return int(val)
	case int:
		return val
	case string:
		n, _ := strconv.Atoi(val)
		return n
	}
	return 0
}

func toInt64(v interface{}) int64 {
	switch val := v.(type) {
	case float64:
		return int64(val)
	case int64:
		return val
	case int:
		return int64(val)
	case string:
		n, _ := strconv.ParseInt(val, 10, 64)
		return n
	}
	return 0
}

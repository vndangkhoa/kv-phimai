package kvtube

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
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

type cachedBytes struct {
	statusCode  int
	contentType string
	body        []byte
	expiry      time.Time
}

type inflightCall struct {
	wg   sync.WaitGroup
	data models.KVTubeVideoResponse
}

type Service struct {
	BaseURL          string
	UpstreamRoot     string
	WarpProxyURL     string
	warpHostPort     string
	OnDeadVideo      func(videoID string)
	apiClient        *http.Client
	streamClient     *http.Client
	warpAPIClient    *http.Client
	warpStreamClient *http.Client

	mu           sync.RWMutex
	videoCache   map[string]cachedVideo
	rawCache     map[string]cachedBytes
	thumbCache   map[string]cachedBytes
	inflight     map[string]*inflightCall
	inflightLock sync.Mutex

	warpMu           sync.Mutex
	warpCheckedAt    time.Time
	warpActiveCached bool
}

var (
	reQualityHeight = regexp.MustCompile(`(\d+)p`)
	reMPDBaseURL    = regexp.MustCompile(`<BaseURL>([^<]+)</BaseURL>`)
)

func buildClients(proxyFunc func(*http.Request) (*url.URL, error)) (*http.Client, *http.Client) {
	transport := &http.Transport{
		Proxy: proxyFunc,
		DialContext: (&net.Dialer{
			Timeout:   8 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          120,
		MaxIdleConnsPerHost:   32,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   8 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
		ResponseHeaderTimeout: 9 * time.Second,
	}

	apiClient := &http.Client{
		Timeout:   14 * time.Second,
		Transport: transport,
	}

	// Stream client with manual redirect interception so 302s to *.googlevideo.com
	// stay inside the server and retain WARP/upstream headers cleanly.
	streamClient := &http.Client{
		Timeout:   0,
		Transport: transport,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	return apiClient, streamClient
}

func NewService(baseURL string, upstreamRoots ...string) *Service {
	cleaned := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if cleaned == "" {
		cleaned = "https://u.khoavo.vndns.net"
	}

	upstream := ""
	if len(upstreamRoots) > 0 {
		upstream = strings.TrimRight(strings.TrimSpace(upstreamRoots[0]), "/")
	}
	if upstream == "" {
		upstream = cleaned + "/api/invidious"
	}

	apiClient, streamClient := buildClients(http.ProxyFromEnvironment)

	warpProxyURL := strings.TrimSpace(os.Getenv("WARP_PROXY"))
	if warpProxyURL == "" {
		warpProxyURL = "http://127.0.0.1:29083"
	}
	var warpAPIClient, warpStreamClient *http.Client
	var warpHostPort string
	if !strings.EqualFold(warpProxyURL, "off") && !strings.EqualFold(warpProxyURL, "none") {
		if parsedWarp, err := url.Parse(warpProxyURL); err == nil && parsedWarp.Host != "" {
			warpHostPort = parsedWarp.Host
			warpAPIClient, warpStreamClient = buildClients(http.ProxyURL(parsedWarp))
		}
	}

	return &Service{
		BaseURL:          cleaned,
		UpstreamRoot:     upstream,
		WarpProxyURL:     warpProxyURL,
		warpHostPort:     warpHostPort,
		apiClient:        apiClient,
		streamClient:     streamClient,
		warpAPIClient:    warpAPIClient,
		warpStreamClient: warpStreamClient,
		videoCache:       make(map[string]cachedVideo),
		rawCache:         make(map[string]cachedBytes),
		thumbCache:       make(map[string]cachedBytes),
		inflight:         make(map[string]*inflightCall),
	}
}

// IsWarpActive checks whether the local userspace Cloudflare WARP HTTP proxy (usque) is reachable.
func (s *Service) IsWarpActive() bool {
	if s.warpHostPort == "" || s.warpAPIClient == nil {
		return false
	}
	s.warpMu.Lock()
	ttl := 12 * time.Second
	if !s.warpActiveCached {
		ttl = 3 * time.Second
	}
	if time.Since(s.warpCheckedAt) < ttl {
		res := s.warpActiveCached
		s.warpMu.Unlock()
		return res
	}
	s.warpMu.Unlock()

	conn, err := net.DialTimeout("tcp", s.warpHostPort, 250*time.Millisecond)
	active := err == nil
	if conn != nil {
		_ = conn.Close()
	}

	s.warpMu.Lock()
	s.warpCheckedAt = time.Now()
	s.warpActiveCached = active
	s.warpMu.Unlock()
	return active
}

func (s *Service) doRequest(req *http.Request, isStream bool, bodyPayload []byte) (*http.Response, error) {
	directClient := s.apiClient
	warpClient := s.warpAPIClient
	if isStream {
		directClient = s.streamClient
		warpClient = s.warpStreamClient
	}

	warpAvailable := warpClient != nil && s.IsWarpActive()
	forceWarp := strings.EqualFold(os.Getenv("WARP_FORCE"), "1") || strings.EqualFold(os.Getenv("WARP_FORCE"), "true")

	buildClone := func() (*http.Request, error) {
		cloned := req.Clone(req.Context())
		if len(bodyPayload) > 0 && req.Method != http.MethodGet && req.Method != http.MethodHead {
			cloned.Body = io.NopCloser(bytes.NewReader(bodyPayload))
		}
		return cloned, nil
	}

	if forceWarp && warpAvailable {
		r1, _ := buildClone()
		resp, err := warpClient.Do(r1)
		if err == nil && resp.StatusCode != 403 && resp.StatusCode != 429 && resp.StatusCode < 502 {
			return resp, nil
		}
		if resp != nil {
			resp.Body.Close()
		}
		r2, _ := buildClone()
		return directClient.Do(r2)
	}

	resp, err := directClient.Do(req)
	if (err != nil || (resp != nil && (resp.StatusCode == 403 || resp.StatusCode == 429 || resp.StatusCode >= 502))) && warpAvailable {
		if resp != nil {
			resp.Body.Close()
		}
		rRetry, _ := buildClone()
		if wResp, wErr := warpClient.Do(rRetry); wErr == nil {
			return wResp, nil
		} else if err != nil {
			return nil, err
		} else {
			return nil, wErr
		}
	}
	return resp, err
}

// RewriteStreamURLToSameOrigin normalizes all Invidious, Companion, yt.khoavo.vndns.net,
// u.khoavo.vndns.net, and IP-bound *.googlevideo.com URLs into same-origin /api/invidious/...
// paths so zero external KV-Tube or googlevideo origins are exposed to the client.
func (s *Service) RewriteStreamURLToSameOrigin(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "blob:") || strings.HasPrefix(trimmed, "data:") {
		return trimmed
	}

	// Already same-origin proxy path
	if strings.HasPrefix(trimmed, "/api/invidious/") || strings.HasPrefix(trimmed, "/api/invidious?") || trimmed == "/api/invidious" {
		return ensureLocalIfNeeded(trimmed)
	}
	if strings.HasPrefix(trimmed, "/api/kvtube/") {
		return trimmed
	}

	// Root-relative upstream path (e.g. /companion/videoplayback..., /api/manifest/dash/..., /videoplayback..., /latest_version...)
	if strings.HasPrefix(trimmed, "/") {
		if strings.HasPrefix(trimmed, "/videoplayback") {
			return ensureLocalIfNeeded("/api/invidious/companion" + trimmed)
		}
		return ensureLocalIfNeeded("/api/invidious" + trimmed)
	}

	u, err := url.Parse(trimmed)
	if err != nil {
		return ensureLocalIfNeeded("/api/invidious/" + strings.TrimLeft(trimmed, "/"))
	}

	host := strings.ToLower(u.Hostname())
	escapedPath := u.EscapedPath()
	if escapedPath == "" {
		escapedPath = "/"
	}
	pathAndQuery := escapedPath
	if u.RawQuery != "" {
		pathAndQuery += "?" + u.RawQuery
	}

	if strings.HasPrefix(u.Path, "/api/invidious/") || u.Path == "/api/invidious" {
		return ensureLocalIfNeeded(pathAndQuery)
	}

	if host == "manifest.googlevideo.com" {
		return ensureLocalIfNeeded("/api/invidious/companion" + pathAndQuery)
	}

	if host == "googlevideo.com" || strings.HasSuffix(host, ".googlevideo.com") {
		q := u.RawQuery
		if !strings.Contains(q, "host=") {
			if q != "" {
				q += "&host=" + url.QueryEscape(u.Host)
			} else {
				q = "host=" + url.QueryEscape(u.Host)
			}
		}
		return "/api/invidious/companion" + escapedPath + "?" + q
	}

	// Route /videoplayback paths through Companion WARP proxy endpoint
	if u.Path == "/videoplayback" || strings.HasPrefix(u.Path, "/videoplayback/") {
		return "/api/invidious/companion" + pathAndQuery
	}

	// Any Invidious/Companion domain (yt.khoavo.vndns.net, u.khoavo.vndns.net, companion:8282, invidious:3000, etc.)
	if strings.HasPrefix(u.Path, "/api/") ||
		strings.HasPrefix(u.Path, "/companion/") ||
		u.Path == "/companion" ||
		strings.HasPrefix(u.Path, "/latest_version") ||
		strings.Contains(host, "khoavo.") ||
		host == "companion" ||
		host == "invidious" ||
		host == "localhost" ||
		host == "127.0.0.1" {
		return ensureLocalIfNeeded("/api/invidious" + pathAndQuery)
	}

	return trimmed
}

func ensureLocalIfNeeded(pathAndQuery string) string {
	shouldLocal := strings.Contains(pathAndQuery, "/api/manifest/") ||
		strings.Contains(pathAndQuery, "/latest_version") ||
		strings.Contains(pathAndQuery, "/api/v1/videos/")
	if shouldLocal && !strings.Contains(pathAndQuery, "local=") {
		if strings.Contains(pathAndQuery, "?") {
			return pathAndQuery + "&local=true"
		}
		return pathAndQuery + "?local=true"
	}
	return pathAndQuery
}

func (s *Service) buildUpstreamTarget(subPath string, rawQuery string) string {
	cleanSub := "/" + strings.TrimLeft(subPath, "/")
	cleanSub = strings.TrimPrefix(cleanSub, "/api/invidious")
	if !strings.HasPrefix(cleanSub, "/") {
		cleanSub = "/" + cleanSub
	}

	// Preserve /companion/* and route /videoplayback* to Companion endpoint on u.khoavo.vndns.net
	// because /companion/videoplayback responds fast over WARP whereas /api/invidious/videoplayback stalls.
	var target string
	if strings.HasPrefix(cleanSub, "/companion/") || cleanSub == "/companion" {
		target = s.BaseURL + cleanSub
	} else if strings.HasPrefix(cleanSub, "/videoplayback") {
		target = s.BaseURL + "/companion" + cleanSub
	} else {
		target = s.UpstreamRoot + cleanSub
	}

	if rawQuery != "" {
		target += "?" + rawQuery
	}
	if strings.HasPrefix(cleanSub, "/api/manifest/") || strings.HasPrefix(cleanSub, "/latest_version") || strings.HasPrefix(cleanSub, "/api/v1/videos/") {
		if !strings.Contains(target, "local=") {
			if strings.Contains(target, "?") {
				target += "&local=true"
			} else {
				target += "?local=true"
			}
		}
	}
	return target
}

func (s *Service) rewriteVideoPayloadMap(raw map[string]interface{}, videoID string) {
	if hls, ok := raw["hlsUrl"].(string); ok && hls != "" {
		raw["hlsUrl"] = s.RewriteStreamURLToSameOrigin(hls)
	}
	if dash, ok := raw["dashUrl"].(string); ok && dash != "" {
		raw["dashUrl"] = s.RewriteStreamURLToSameOrigin(dash)
	}
	if fsList, ok := raw["formatStreams"].([]interface{}); ok {
		for _, item := range fsList {
			if m, ok := item.(map[string]interface{}); ok {
				if rawURL, _ := m["url"].(string); rawURL != "" {
					m["url"] = s.RewriteStreamURLToSameOrigin(rawURL)
				}
			}
		}
	}
	if afList, ok := raw["adaptiveFormats"].([]interface{}); ok {
		for _, item := range afList {
			if m, ok := item.(map[string]interface{}); ok {
				if rawURL, _ := m["url"].(string); rawURL != "" {
					m["url"] = s.RewriteStreamURLToSameOrigin(rawURL)
				}
			}
		}
	}
	if capList, ok := raw["captions"].([]interface{}); ok {
		for _, item := range capList {
			if m, ok := item.(map[string]interface{}); ok {
				if cURL, _ := m["url"].(string); cURL != "" {
					m["url"] = s.RewriteStreamURLToSameOrigin(cURL)
				}
			}
		}
	}
	if thumbs, ok := raw["videoThumbnails"].([]interface{}); ok && videoID != "" {
		for _, item := range thumbs {
			if m, ok := item.(map[string]interface{}); ok {
				if q, _ := m["quality"].(string); q != "" {
					m["url"] = fmt.Sprintf("/api/kvtube/thumb/%s?q=%s", url.PathEscape(videoID), url.QueryEscape(q))
				}
			}
		}
	}
}

func (s *Service) rewriteMPDManifest(xmlBytes []byte) []byte {
	text := string(xmlBytes)
	text = strings.ReplaceAll(text, "https://yt.khoavo.vndns.net/videoplayback", "/api/invidious/companion/videoplayback")
	text = strings.ReplaceAll(text, "https://yt.khoavo.vndns.net/", "/api/invidious/")
	text = strings.ReplaceAll(text, "https://u.khoavo.vndns.net/api/invidious/", "/api/invidious/")
	text = strings.ReplaceAll(text, "https://ut.khoavo.myds.me/api/invidious/", "/api/invidious/")

	// Rewrite <BaseURL>/companion/...</BaseURL> or <BaseURL>/videoplayback...</BaseURL> preserving /companion/
	text = reMPDBaseURL.ReplaceAllStringFunc(text, func(match string) string {
		inner := strings.TrimSuffix(strings.TrimPrefix(match, "<BaseURL>"), "</BaseURL>")
		trimmed := strings.TrimSpace(inner)
		if strings.HasPrefix(trimmed, "/companion/") || trimmed == "/companion" {
			trimmed = "/api/invidious" + trimmed
		} else if strings.HasPrefix(trimmed, "/videoplayback") {
			trimmed = "/api/invidious/companion" + trimmed
		} else if strings.HasPrefix(trimmed, "https://") {
			unescaped := strings.ReplaceAll(trimmed, "&amp;", "&")
			rewritten := s.RewriteStreamURLToSameOrigin(unescaped)
			trimmed = strings.ReplaceAll(rewritten, "&", "&amp;")
		}
		return "<BaseURL>" + trimmed + "</BaseURL>"
	})
	return []byte(text)
}

func (s *Service) rewriteHLSPlaylist(m3u8 []byte) []byte {
	lines := strings.Split(string(m3u8), "\n")
	for i, line := range lines {
		tr := strings.TrimSpace(line)
		if tr == "" {
			continue
		}
		if strings.HasPrefix(tr, "#") {
			// Rewrite URI="..." attributes inside #EXT-X-MEDIA or #EXT-X-MAP
			if idx := strings.Index(tr, `URI="`); idx >= 0 {
				rest := tr[idx+5:]
				if endIdx := strings.Index(rest, `"`); endIdx >= 0 {
					uriVal := rest[:endIdx]
					rewritten := s.RewriteStreamURLToSameOrigin(uriVal)
					lines[i] = tr[:idx+5] + rewritten + rest[endIdx:]
				}
			}
			continue
		}
		lines[i] = s.RewriteStreamURLToSameOrigin(tr)
	}
	return []byte(strings.Join(lines, "\n"))
}

// fetchRawInvidiousVideo fetches /api/v1/videos/{id}?local=true with 15-min caching and rewrites URLs.
func (s *Service) fetchRawInvidiousVideo(ctx context.Context, videoID string) ([]byte, map[string]interface{}, error) {
	cacheKey := "video:" + videoID
	s.mu.RLock()
	cached, ok := s.rawCache[cacheKey]
	s.mu.RUnlock()
	if ok && time.Now().Before(cached.expiry) && len(cached.body) > 0 {
		var parsed map[string]interface{}
		if json.Unmarshal(cached.body, &parsed) == nil {
			return cached.body, parsed, nil
		}
	}

	apiURL := fmt.Sprintf("%s/api/v1/videos/%s?local=true", s.UpstreamRoot, url.PathEscape(videoID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")

	resp, err := s.doRequest(req, false, nil)
	if err != nil {
		return nil, nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return nil, nil, err
	}
	if resp.StatusCode != http.StatusOK || len(bytes.TrimSpace(bodyBytes)) == 0 {
		lowerBody := strings.ToLower(string(bodyBytes))
		if strings.Contains(lowerBody, "private video") ||
			strings.Contains(lowerBody, "this video is private") ||
			strings.Contains(lowerBody, "video unavailable") ||
			strings.Contains(lowerBody, "no longer available") ||
			strings.Contains(lowerBody, "has been removed") ||
			strings.Contains(lowerBody, "account associated with this video has been terminated") {
			return nil, nil, fmt.Errorf("unavailable: %s", strings.TrimSpace(string(bodyBytes)))
		}
		return nil, nil, fmt.Errorf("upstream status %d", resp.StatusCode)
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &raw); err != nil {
		return nil, nil, err
	}

	s.rewriteVideoPayloadMap(raw, videoID)
	rewrittenBytes, err := json.Marshal(raw)
	if err != nil {
		rewrittenBytes = bodyBytes
	}

	s.mu.Lock()
	if len(s.rawCache) > 600 {
		s.rawCache = make(map[string]cachedBytes)
	}
	s.rawCache[cacheKey] = cachedBytes{
		statusCode:  http.StatusOK,
		contentType: "application/json; charset=utf-8",
		body:        rewrittenBytes,
		expiry:      time.Now().Add(15 * time.Minute),
	}
	s.mu.Unlock()

	return rewrittenBytes, raw, nil
}

// ProxyInvidious acts as a full native same-origin /api/invidious/* proxy matching KV-Tube's architecture.
func (s *Service) ProxyInvidious(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS, HEAD")
		w.Header().Set("Access-Control-Allow-Headers", "*")
		w.WriteHeader(http.StatusNoContent)
		return
	}

	subPath := strings.TrimPrefix(r.URL.Path, "/api/invidious")
	if !strings.HasPrefix(subPath, "/") {
		subPath = "/" + subPath
	}

	// Fast cached path for /api/invidious/api/v1/videos/{id}
	if r.Method == http.MethodGet && strings.HasPrefix(subPath, "/api/v1/videos/") {
		vid := strings.Trim(strings.TrimPrefix(subPath, "/api/v1/videos/"), "/")
		if vid != "" && !strings.Contains(vid, "/") {
			body, _, err := s.fetchRawInvidiousVideo(r.Context(), vid)
			if err == nil {
				w.Header().Set("Content-Type", "application/json; charset=utf-8")
				w.Header().Set("Access-Control-Allow-Origin", "*")
				w.Header().Set("Cache-Control", "public, max-age=120")
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write(body)
				return
			}
		}
	}

	// Cached fast path for manifests (/api/manifest/dash/... or /api/manifest/hls_variant/...)
	isManifest := strings.HasPrefix(subPath, "/api/manifest/")
	manifestCacheKey := "manifest:" + subPath + "?" + r.URL.RawQuery
	if isManifest && r.Method == http.MethodGet {
		s.mu.RLock()
		cached, ok := s.rawCache[manifestCacheKey]
		s.mu.RUnlock()
		if ok && time.Now().Before(cached.expiry) {
			w.Header().Set("Content-Type", cached.contentType)
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Cache-Control", "public, max-age=120")
			w.WriteHeader(cached.statusCode)
			_, _ = w.Write(cached.body)
			return
		}
	}

	// Preserve /companion/* and route through buildUpstreamTarget
	targetURL := s.buildUpstreamTarget(subPath, r.URL.RawQuery)

	var bodyBytes []byte
	if r.Method != http.MethodGet && r.Method != http.MethodHead && r.Body != nil {
		bodyBytes, _ = io.ReadAll(io.LimitReader(r.Body, 4*1024*1024))
	}

	// Perform upstream request following Companion/Invidious redirects safely on the server side
	var upstreamResp *http.Response
	currentURL := targetURL
	currentMethod := r.Method
	for hop := 0; hop <= 4; hop++ {
		var bodyReader io.Reader
		if len(bodyBytes) > 0 && currentMethod != http.MethodGet && currentMethod != http.MethodHead {
			bodyReader = bytes.NewReader(bodyBytes)
		}
		upReq, err := http.NewRequestWithContext(r.Context(), currentMethod, currentURL, bodyReader)
		if err != nil {
			http.Error(w, `{"error":"invalid upstream request"}`, http.StatusBadGateway)
			return
		}
		upReq.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")
		upReq.Header.Set("Accept-Language", "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7")
		upReq.Header.Set("Accept-Encoding", "identity")
		if rng := r.Header.Get("Range"); rng != "" {
			upReq.Header.Set("Range", rng)
		}
		if ifRng := r.Header.Get("If-Range"); ifRng != "" {
			upReq.Header.Set("If-Range", ifRng)
		}
		if ct := r.Header.Get("Content-Type"); ct != "" {
			upReq.Header.Set("Content-Type", ct)
		}
		if acc := r.Header.Get("Accept"); acc != "" {
			upReq.Header.Set("Accept", acc)
		}

		res, err := s.doRequest(upReq, true, bodyBytes)
		if err != nil {
			http.Error(w, `{"error":"upstream connection failed"}`, http.StatusBadGateway)
			return
		}

		if (res.StatusCode == 301 || res.StatusCode == 302 || res.StatusCode == 303 || res.StatusCode == 307 || res.StatusCode == 308) && res.Header.Get("Location") != "" && hop < 4 {
			loc := res.Header.Get("Location")
			res.Body.Close()
			if res.StatusCode == 303 {
				currentMethod = http.MethodGet
			}
			// Rewrite redirect targets through upstream or follow direct URL
			if strings.HasPrefix(loc, "/") {
				trimmedLoc := strings.TrimPrefix(loc, "/api/invidious")
				currentURL = s.buildUpstreamTarget(trimmedLoc, "")
			} else if strings.Contains(loc, "yt.khoavo.vndns.net") || strings.Contains(loc, "u.khoavo.vndns.net") {
				if parsedLoc, perr := url.Parse(loc); perr == nil {
					currentURL = s.buildUpstreamTarget(parsedLoc.Path, parsedLoc.RawQuery)
				} else {
					currentURL = loc
				}
			} else {
				currentURL = loc
			}
			continue
		}

		upstreamResp = res
		break
	}

	if upstreamResp == nil {
		http.Error(w, `{"error":"upstream failed"}`, http.StatusBadGateway)
		return
	}
	defer upstreamResp.Body.Close()

	ct := upstreamResp.Header.Get("Content-Type")
	lowerCT := strings.ToLower(ct)

	// Manifest rewriting & caching
	if isManifest || strings.Contains(lowerCT, "dash+xml") || strings.Contains(lowerCT, "mpegurl") {
		rawBody, err := io.ReadAll(io.LimitReader(upstreamResp.Body, 8*1024*1024))
		if err != nil {
			http.Error(w, `{"error":"failed reading manifest"}`, http.StatusBadGateway)
			return
		}
		var out []byte
		if strings.Contains(subPath, "dash") || strings.Contains(lowerCT, "dash+xml") || bytes.Contains(rawBody, []byte("<MPD")) {
			out = s.rewriteMPDManifest(rawBody)
			if ct == "" {
				ct = "application/dash+xml"
			}
		} else {
			out = s.rewriteHLSPlaylist(rawBody)
			if ct == "" {
				ct = "application/vnd.apple.mpegurl"
			}
		}

		if r.Method == http.MethodGet && upstreamResp.StatusCode == http.StatusOK && len(out) > 0 {
			s.mu.Lock()
			if len(s.rawCache) > 600 {
				s.rawCache = make(map[string]cachedBytes)
			}
			s.rawCache[manifestCacheKey] = cachedBytes{
				statusCode:  http.StatusOK,
				contentType: ct,
				body:        out,
				expiry:      time.Now().Add(5 * time.Minute),
			}
			s.mu.Unlock()
		}

		w.Header().Set("Content-Type", ct)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Content-Length", strconv.Itoa(len(out)))
		w.WriteHeader(upstreamResp.StatusCode)
		if r.Method != http.MethodHead {
			_, _ = w.Write(out)
		}
		return
	}

	// Pass-through binary media or other API responses cleanly
	for _, h := range []string{"Content-Type", "Content-Length", "Content-Range", "Accept-Ranges", "ETag"} {
		if val := upstreamResp.Header.Get(h); val != "" {
			w.Header().Set(h, val)
		}
	}
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS, HEAD")
	w.Header().Set("Access-Control-Allow-Headers", "*")

	statusCode := upstreamResp.StatusCode
	if statusCode == http.StatusOK && r.Header.Get("Range") != "" && upstreamResp.Header.Get("Content-Range") != "" {
		statusCode = http.StatusPartialContent
	}
	w.WriteHeader(statusCode)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, upstreamResp.Body)
	}
}

func parseHeightFromMap(m map[string]interface{}) int {
	if h := toInt(m["height"]); h >= 144 {
		return h
	}
	if ql, _ := m["qualityLabel"].(string); ql != "" {
		if match := reQualityHeight.FindStringSubmatch(ql); len(match) >= 2 {
			if n, err := strconv.Atoi(match[1]); err == nil && n >= 144 {
				return n
			}
		}
	}
	if res, _ := m["resolution"].(string); res != "" {
		if match := reQualityHeight.FindStringSubmatch(res); len(match) >= 2 {
			if n, err := strconv.Atoi(match[1]); err == nil && n >= 144 {
				return n
			}
		}
		if strings.Contains(res, "x") {
			parts := strings.Split(res, "x")
			if len(parts) == 2 {
				if n, err := strconv.Atoi(parts[1]); err == nil && n >= 144 {
					return n
				}
			}
		}
	}
	itagNum := toInt(m["itag"])
	switch itagNum {
	case 313, 315, 401, 266, 138:
		return 2160
	case 271, 308, 400, 264:
		return 1440
	case 137, 248, 299, 303, 399:
		return 1080
	case 22, 136, 247, 298, 302, 398:
		return 720
	case 135, 244, 397:
		return 480
	case 18, 134, 243, 396:
		return 360
	case 133, 242, 395:
		return 240
	case 160, 278, 394:
		return 144
	}
	return 0
}

func codecScore(typ string) int {
	lower := strings.ToLower(typ)
	if strings.Contains(lower, "avc1") {
		return 30 // universal H.264 hardware decode
	}
	if strings.Contains(lower, "vp9") || strings.Contains(lower, "vp09") {
		return 20
	}
	if strings.Contains(lower, "av01") {
		return 10
	}
	return 5
}

func (s *Service) GetVideo(ctx context.Context, videoID string, fallback *models.Film, channelIDs map[string]string, related []models.Film, series []models.Film) models.KVTubeVideoResponse {
	s.mu.RLock()
	if cached, ok := s.videoCache[videoID]; ok && time.Now().Before(cached.expiry) {
		resp := cached.data
		s.mu.RUnlock()
		if fallback != nil {
			fCopy := *fallback
			resp.Film = &fCopy
		}
		if len(related) > 0 {
			resp.Related = related
		}
		if len(series) > 0 {
			resp.Series = series
		}
		return resp
	}
	s.mu.RUnlock()

	// Coalesce concurrent cold fetches for the same videoID
	s.inflightLock.Lock()
	if call, exists := s.inflight[videoID]; exists {
		s.inflightLock.Unlock()
		call.wg.Wait()
		resp := call.data
		if fallback != nil {
			fCopy := *fallback
			resp.Film = &fCopy
		}
		if len(related) > 0 {
			resp.Related = related
		}
		if len(series) > 0 {
			resp.Series = series
		}
		return resp
	}
	call := &inflightCall{}
	call.wg.Add(1)
	s.inflight[videoID] = call
	s.inflightLock.Unlock()

	defer func() {
		call.wg.Done()
		s.inflightLock.Lock()
		delete(s.inflight, videoID)
		s.inflightLock.Unlock()
	}()

	resp := models.KVTubeVideoResponse{
		ID:              videoID,
		WatchURL:        "/watch?v=" + videoID,
		EmbedURL:        "/watch?v=" + videoID,
		ThumbnailURL:    "/api/kvtube/thumb/" + videoID,
		DirectStreamURL: fmt.Sprintf("/api/invidious/latest_version?id=%s&itag=18&local=true", url.QueryEscape(videoID)),
		BestAudioURL:    fmt.Sprintf("/api/invidious/latest_version?id=%s&itag=140&local=true", url.QueryEscape(videoID)),
		DashURL:         fmt.Sprintf("/api/invidious/api/manifest/dash/id/%s?local=true", url.PathEscape(videoID)),
		Streams:         []models.KVTubeStreamItem{},
		Captions:        []models.KVTubeCaption{},
	}

	if fallback != nil {
		fCopy := *fallback
		resp.Film = &fCopy
		resp.Title = fallback.Title
		resp.Author = fallback.Channel
		resp.ViewCount = fallback.ViewsNum
		resp.LengthSeconds = fallback.DurMins * 60
		if fallback.Channel != "" {
			resp.ChannelURL = "/channel/" + url.PathEscape(fallback.Channel)
		}
	}

	_, raw, err := s.fetchRawInvidiousVideo(ctx, videoID)
	if err != nil && strings.HasPrefix(err.Error(), "unavailable:") {
		resp.Unavailable = true
		resp.UnavailableReason = "Video gốc đã bị kênh chủ quản đặt riêng tư (Private) hoặc gỡ bỏ."
		if s.OnDeadVideo != nil {
			go s.OnDeadVideo(videoID)
		}
	}
	if err == nil && raw != nil {
		if t, ok := raw["title"].(string); ok && t != "" && resp.Title == "" {
			resp.Title = t
		}
		if a, ok := raw["author"].(string); ok && a != "" && resp.Author == "" {
			resp.Author = a
		}
		if aid, ok := raw["authorId"].(string); ok && aid != "" {
			resp.AuthorID = aid
		}
		if d, ok := raw["description"].(string); ok && d != "" {
			resp.Description = d
		} else if dh, ok := raw["descriptionHtml"].(string); ok && dh != "" {
			resp.Description = dh
		}
		if ls := toInt(raw["lengthSeconds"]); ls > 0 {
			resp.LengthSeconds = ls
		}
		if vc := toInt64(raw["viewCount"]); vc > 0 && resp.ViewCount == 0 {
			resp.ViewCount = vc
		}
		if hls, ok := raw["hlsUrl"].(string); ok && hls != "" {
			resp.HlsURL = s.RewriteStreamURLToSameOrigin(hls)
		}
		if dash, ok := raw["dashUrl"].(string); ok && dash != "" {
			resp.DashURL = s.RewriteStreamURLToSameOrigin(dash)
		}

		// Progressive formatStreams
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
				rewritten := s.RewriteStreamURLToSameOrigin(rawURL)
				m["url"] = rewritten
				h := parseHeightFromMap(m)
				if h > 0 {
					m["height"] = h
				}
				resp.FormatStreams = append(resp.FormatStreams, m)

				qual, _ := m["qualityLabel"].(string)
				if qual == "" {
					if h > 0 {
						qual = fmt.Sprintf("%dp", h)
					} else {
						qual = "360p"
					}
				}
				typ, _ := m["type"].(string)
				cont, _ := m["container"].(string)
				enc, _ := m["encoding"].(string)
				itag := fmt.Sprintf("%v", m["itag"])
				resp.Streams = append(resp.Streams, models.KVTubeStreamItem{
					URL:          rewritten,
					Quality:      qual,
					QualityLabel: qual,
					Itag:         itag,
					Type:         typ,
					Container:    cont,
					Encoding:     enc,
					Height:       h,
					Bitrate:      toInt64(m["bitrate"]),
					FPS:          toInt(m["fps"]),
					HasAudio:     true,
				})
			}
		}

		// Adaptive formats (2160p, 1440p, 1080p, 720p, 480p, 360p + audio tracks)
		type audioCandidate struct {
			url   string
			score int
		}
		var audioCands []audioCandidate
		var videoAdapt []map[string]interface{}

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
				rewritten := s.RewriteStreamURLToSameOrigin(rawURL)
				m["url"] = rewritten

				typ, _ := m["type"].(string)
				lowerTyp := strings.ToLower(typ)
				if strings.Contains(lowerTyp, "audio/") || m["audioQuality"] != nil {
					resp.AdaptiveFormats = append(resp.AdaptiveFormats, m)
					score := 0
					if strings.Contains(lowerTyp, "audio/mp4") {
						score += 100
					}
					if strings.Contains(rawURL, "acont%3Doriginal") || strings.Contains(rawURL, "acont=original") {
						score += 50
					} else if !strings.Contains(rawURL, "acont%3Ddubbed") && !strings.Contains(rawURL, "acont=dubbed") {
						score += 30
					}
					if strings.Contains(rawURL, "drc%3D1") || strings.Contains(rawURL, "drc=1") {
						score -= 10
					}
					score += int(toInt64(m["bitrate"]) / 10000)
					audioCands = append(audioCands, audioCandidate{url: rewritten, score: score})
					continue
				}

				h := parseHeightFromMap(m)
				if h >= 144 {
					m["height"] = h
					videoAdapt = append(videoAdapt, m)
				}
			}
		}

		if len(audioCands) > 0 {
			sort.Slice(audioCands, func(i, j int) bool {
				return audioCands[i].score > audioCands[j].score
			})
			resp.BestAudioURL = audioCands[0].url
		}

		// Sort video adaptiveFormats: Height DESC, universal codec DESC, Bitrate DESC
		sort.SliceStable(videoAdapt, func(i, j int) bool {
			hi := toInt(videoAdapt[i]["height"])
			hj := toInt(videoAdapt[j]["height"])
			if hi != hj {
				return hi > hj
			}
			ti, _ := videoAdapt[i]["type"].(string)
			tj, _ := videoAdapt[j]["type"].(string)
			si, sj := codecScore(ti), codecScore(tj)
			if si != sj {
				return si > sj
			}
			return toInt64(videoAdapt[i]["bitrate"]) > toInt64(videoAdapt[j]["bitrate"])
		})

		for _, m := range videoAdapt {
			resp.AdaptiveFormats = append(resp.AdaptiveFormats, m)
		}

		// Captions
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
						URL:          s.RewriteStreamURLToSameOrigin(cURL),
					})
				}
			}
		}
	}

	if resp.ChannelURL == "" {
		if resp.Author != "" {
			resp.ChannelURL = "/channel/" + url.PathEscape(resp.Author)
		} else {
			resp.ChannelURL = "/"
		}
	}

	// Ensure a progressive 360p fallback stream always exists
	if len(resp.Streams) == 0 {
		resp.Streams = append(resp.Streams, models.KVTubeStreamItem{
			URL:          fmt.Sprintf("/api/invidious/latest_version?id=%s&itag=18&local=true", url.QueryEscape(videoID)),
			Quality:      "360p",
			QualityLabel: "360p",
			Itag:         "18",
			Type:         `video/mp4; codecs="avc1.42001E, mp4a.40.2"`,
			Container:    "mp4",
			Height:       360,
			Bitrate:      600000,
			HasAudio:     true,
		})
	}

	// Cache video response without request-specific slices first, then populate them
	cacheEntry := resp
	cacheEntry.Film = nil
	cacheEntry.Related = nil
	cacheEntry.Series = nil

	s.mu.Lock()
	if len(s.videoCache) > 600 {
		s.videoCache = make(map[string]cachedVideo)
	}
	s.videoCache[videoID] = cachedVideo{
		data:   cacheEntry,
		expiry: time.Now().Add(15 * time.Minute),
	}
	s.mu.Unlock()

	call.data = cacheEntry

	if fallback != nil {
		fCopy := *fallback
		resp.Film = &fCopy
	}
	if len(related) > 0 {
		resp.Related = related
	}
	if len(series) > 0 {
		resp.Series = series
	}
	return resp
}

// Prewarm resolves the top catalog videos concurrently in the background on startup
// so the user's first film clicks open instantaneously.
func (s *Service) Prewarm(films []models.Film, maxCount int) {
	if len(films) == 0 {
		return
	}
	if maxCount > len(films) {
		maxCount = len(films)
	}
	sem := make(chan struct{}, 3)
	for i := 0; i < maxCount; i++ {
		f := films[i]
		if f.ID == "" {
			continue
		}
		go func(film models.Film) {
			sem <- struct{}{}
			defer func() { <-sem }()
			ctx, cancel := context.WithTimeout(context.Background(), 12*time.Second)
			defer cancel()
			s.GetVideo(ctx, film.ID, &film, nil, nil, nil)
		}(f)
	}
	log.Printf("Pre-warming stream cache for %d featured films", maxCount)
}

// GetChannelUpstream fetches live channel metadata and latest videos from upstream Invidious (cached 30 min).
func (s *Service) GetChannelUpstream(ctx context.Context, authorID string) (map[string]interface{}, error) {
	if authorID == "" {
		return nil, fmt.Errorf("missing authorID")
	}
	cacheKey := "channel:" + authorID
	s.mu.RLock()
	if cached, ok := s.rawCache[cacheKey]; ok && time.Now().Before(cached.expiry) && len(cached.body) > 0 {
		var parsed map[string]interface{}
		if json.Unmarshal(cached.body, &parsed) == nil {
			s.mu.RUnlock()
			return parsed, nil
		}
	}
	s.mu.RUnlock()

	apiURL := fmt.Sprintf("%s/api/v1/channels/%s", s.UpstreamRoot, url.PathEscape(authorID))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")

	resp, err := s.doRequest(req, false, nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK || len(bytes.TrimSpace(bodyBytes)) == 0 {
		return nil, fmt.Errorf("upstream channel status %d", resp.StatusCode)
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(bodyBytes, &parsed); err != nil {
		return nil, err
	}

	s.mu.Lock()
	if len(s.rawCache) > 600 {
		s.rawCache = make(map[string]cachedBytes)
	}
	s.rawCache[cacheKey] = cachedBytes{
		statusCode:  http.StatusOK,
		contentType: "application/json; charset=utf-8",
		body:        bodyBytes,
		expiry:      time.Now().Add(30 * time.Minute),
	}
	s.mu.Unlock()
	return parsed, nil
}

// ProxyStream streams video bytes from upstream latest_version proxy with Range support.
func (s *Service) ProxyStream(w http.ResponseWriter, r *http.Request, videoID string) {
	itag := r.URL.Query().Get("itag")
	if itag == "" {
		itag = "18"
	}

	upstreamURL := fmt.Sprintf("%s/latest_version?id=%s&itag=%s&local=true",
		s.UpstreamRoot, url.QueryEscape(videoID), url.QueryEscape(itag))

	req, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL, nil)
	if err != nil {
		http.Error(w, `{"error":"invalid upstream request"}`, http.StatusBadGateway)
		return
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")
	req.Header.Set("Accept-Encoding", "identity")
	if rng := r.Header.Get("Range"); rng != "" {
		req.Header.Set("Range", rng)
	}

	resp, err := s.doRequest(req, true, nil)
	if err != nil {
		http.Error(w, `{"error":"stream upstream unreachable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 && resp.StatusCode < 400 && resp.Header.Get("Location") != "" {
		http.Redirect(w, r, s.RewriteStreamURLToSameOrigin(resp.Header.Get("Location")), resp.StatusCode)
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
	w.Header().Set("X-Accel-Buffering", "no")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	statusCode := resp.StatusCode
	if statusCode == http.StatusOK && r.Header.Get("Range") != "" && resp.Header.Get("Content-Range") != "" {
		statusCode = http.StatusPartialContent
	}
	w.WriteHeader(statusCode)
	if r.Method != http.MethodHead {
		_, _ = io.Copy(w, resp.Body)
	}
}

// ProxyThumb proxies video thumbnails with 6-hour in-memory cache.
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
		if r.Method != http.MethodHead {
			_, _ = w.Write(cached.body)
		}
		return
	}
	s.mu.RUnlock()

	candidates := []string{
		fmt.Sprintf("%s/vi/%s/hqdefault.jpg", s.UpstreamRoot, url.PathEscape(videoID)),
		fmt.Sprintf("%s/vi/%s/maxresdefault.jpg", s.UpstreamRoot, url.PathEscape(videoID)),
		fmt.Sprintf("%s/vi/%s/mqdefault.jpg", s.UpstreamRoot, url.PathEscape(videoID)),
		fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", url.PathEscape(videoID)),
	}

	seen404 := 0
	for _, target := range candidates {
		ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
		if err != nil {
			cancel()
			continue
		}
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PhimAI/2.0")
		resp, err := s.doRequest(req, false, nil)
		if err != nil {
			cancel()
			continue
		}
		if resp.StatusCode == http.StatusNotFound {
			seen404++
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
				s.thumbCache = make(map[string]cachedBytes)
			}
			s.thumbCache[cacheKey] = cachedBytes{
				contentType: ct,
				body:        body,
				expiry:      time.Now().Add(6 * time.Hour),
			}
			s.mu.Unlock()

			w.Header().Set("Content-Type", ct)
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.WriteHeader(http.StatusOK)
			if r.Method != http.MethodHead {
				_, _ = w.Write(body)
			}
			return
		}
	}
	if seen404 == len(candidates) && s.OnDeadVideo != nil {
		go s.OnDeadVideo(videoID)
	}

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
  <text x="240" y="185" fill="#f1f1f1" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle">PHIMAI CINEMA</text>
  <text x="240" y="210" fill="#aaaaaa" font-family="monospace" font-size="12" text-anchor="middle">%s</text>
</svg>`, videoID)

	w.Header().Set("Content-Type", "image/svg+xml; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		_, _ = w.Write([]byte(svg))
	}
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

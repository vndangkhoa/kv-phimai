package api

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"phimai-backend/internal/catalog"
	"phimai-backend/internal/kvtube"
	"phimai-backend/internal/models"

	"github.com/go-chi/chi/v5"
	"gorm.io/gorm"
)

const codeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

type tvPairEntry struct {
	Code        string `json:"code"`
	InstanceURL string `json:"instanceUrl,omitempty"`
	Token       string `json:"token,omitempty"`
	RoomCode    string `json:"roomCode,omitempty"`
	FilmID      string `json:"filmId,omitempty"`
	CreatedAt   int64  `json:"createdAt"`
	ExpiresAt   int64  `json:"expiresAt"`
	Linked      bool   `json:"linked"`
	Consumed    bool   `json:"consumed"`
}

type Handler struct {
	DB      *gorm.DB
	Catalog *catalog.Catalog
	KVTube  *kvtube.Service

	mu           sync.RWMutex
	sitePresence map[string]time.Time
	filmPresence map[string]map[string]time.Time
	tvPairs      map[string]*tvPairEntry
}

func NewHandler(db *gorm.DB, cat *catalog.Catalog, kvt *kvtube.Service) *Handler {
	return &Handler{
		DB:           db,
		Catalog:      cat,
		KVTube:       kvt,
		sitePresence: make(map[string]time.Time),
		filmPresence: make(map[string]map[string]time.Time),
		tvPairs:      make(map[string]*tvPairEntry),
	}
}

func writeJSON(w http.ResponseWriter, status int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func generateShortCode(length int) string {
	b := make([]byte, length)
	max := big.NewInt(int64(len(codeAlphabet)))
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			b[i] = codeAlphabet[i%len(codeAlphabet)]
		} else {
			b[i] = codeAlphabet[n.Int64()]
		}
	}
	return string(b)
}

// ---------------------------------------------------------------------------
// 1. HEALTH & MANIFEST
// ---------------------------------------------------------------------------

func (h *Handler) GetHealth(w http.ResponseWriter, r *http.Request) {
	liveTotal := len(h.Catalog.Films) - len(h.Catalog.DeadIDs)
	if v, ok := h.Catalog.Manifest["liveTotal"]; ok {
		if fl, ok := v.(float64); ok && int(fl) > 0 {
			liveTotal = int(fl)
		}
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":     "healthy",
		"ok":         true,
		"service":    "phimai",
		"version":    "1.0.4",
		"warpActive": h.KVTube.IsWarpActive(),
		"warpProxy":  h.KVTube.WarpProxyURL,
		"totalFilms": len(h.Catalog.Films),
		"liveFilms":  liveTotal,
	})
}

func (h *Handler) GetManifest(w http.ResponseWriter, r *http.Request) {
	out := make(map[string]interface{}, len(h.Catalog.Manifest)+2)
	for k, v := range h.Catalog.Manifest {
		out[k] = v
	}
	out["playlists"] = h.Catalog.Playlists
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// 2. FILMS CATALOG, SEARCH & DETAIL
// ---------------------------------------------------------------------------

func (h *Handler) getHotCountsMap() map[string]int {
	var records []models.FilmPlayRecord
	h.DB.Find(&records)
	out := make(map[string]int, len(records))
	for _, r := range records {
		out[r.FilmID] = r.Count
	}
	return out
}

func (h *Handler) getRatingsMap() map[string]models.RatingStat {
	var records []models.RatingRecord
	h.DB.Find(&records)
	out := make(map[string]models.RatingStat, len(records))
	for _, r := range records {
		out[r.FilmID] = models.RatingStat{S: r.StarsSum, N: r.VoteCount}
	}
	return out
}

func parseFilterParams(r *http.Request) catalog.FilterParams {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	if page <= 0 {
		page = 1
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 {
		limit = 60
	}
	fullParam := strings.ToLower(q.Get("full"))
	famParam := strings.ToLower(q.Get("family"))

	var ids []string
	if rawIDs := strings.TrimSpace(q.Get("ids")); rawIDs != "" {
		ids = strings.Split(rawIDs, ",")
	}

	return catalog.FilterParams{
		Sort:       q.Get("sort"),
		Cat:        q.Get("cat"),
		Genre:      q.Get("genre"),
		FullOnly:   fullParam == "1" || fullParam == "true" || q.Get("form") == "full",
		Mood:       q.Get("mood"),
		Time:       q.Get("time"),
		FamilyMode: famParam == "1" || famParam == "true",
		Query:      q.Get("q"),
		Channel:    q.Get("channel"),
		Tool:       q.Get("tool"),
		IDs:        ids,
		Page:       page,
		Limit:      limit,
	}
}

func (h *Handler) GetFilms(w http.ResponseWriter, r *http.Request) {
	p := parseFilterParams(r)
	hotCounts := h.getHotCountsMap()
	ratings := h.getRatingsMap()

	items, total := h.Catalog.QueryFilms(p, hotCounts, ratings)
	hasMore := p.Page*p.Limit < total

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":   items,
		"total":   total,
		"page":    p.Page,
		"limit":   p.Limit,
		"hasMore": hasMore,
	})
}

func (h *Handler) SearchFilms(w http.ResponseWriter, r *http.Request) {
	p := parseFilterParams(r)
	hotCounts := h.getHotCountsMap()
	ratings := h.getRatingsMap()

	items, total := h.Catalog.QueryFilms(p, hotCounts, ratings)
	hasMore := p.Page*p.Limit < total

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items":   items,
		"total":   total,
		"page":    p.Page,
		"limit":   p.Limit,
		"hasMore": hasMore,
		"query":   p.Query,
	})
}

func (h *Handler) GetFilmDetail(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": "missing film id"})
		return
	}

	film, ok := h.Catalog.GetFilmByID(id)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"error": "film not found", "id": id})
		return
	}

	var ratingRec models.RatingRecord
	rating := models.RatingStat{S: 0, N: 0}
	if h.DB.Where("film_id = ?", id).First(&ratingRec).Error == nil {
		rating = models.RatingStat{S: ratingRec.StarsSum, N: ratingRec.VoteCount}
	}

	var commentCount int64
	h.DB.Model(&models.CommentRecord{}).Where("film_id = ?", id).Count(&commentCount)

	series := h.Catalog.GetSeries(id)
	detail := models.FilmDetail{
		Film:         film,
		Series:       series,
		Episodes:     series,
		Related:      h.Catalog.GetRelated(film, 8),
		Rating:       rating,
		CommentCount: int(commentCount),
		KVTube: models.KVTubeStreamBrief{
			ID:              film.ID,
			WatchURL:        film.WatchURL,
			EmbedURL:        film.EmbedURL,
			ChannelURL:      film.ChannelURL,
			ThumbnailURL:    film.ThumbnailURL,
			DirectStreamURL: film.StreamURL,
		},
	}

	writeJSON(w, http.StatusOK, detail)
}

// ---------------------------------------------------------------------------
// 3. NATIVE SAME-ORIGIN INVIDIOUS / COMPANION PROXY & VIDEO ENGINE
// ---------------------------------------------------------------------------

func (h *Handler) ProxyInvidious(w http.ResponseWriter, r *http.Request) {
	h.KVTube.ProxyInvidious(w, r)
}

func (h *Handler) GetKVTubeVideo(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": "missing video id"})
		return
	}

	var fallbackPtr *models.Film
	var related []models.Film
	var series []models.Film
	if f, ok := h.Catalog.GetFilmByID(id); ok {
		fallbackPtr = &f
		related = h.Catalog.GetRelated(f, 16)
		series = h.Catalog.GetSeries(id)
	}

	info := h.KVTube.GetVideo(r.Context(), id, fallbackPtr, h.Catalog.ChannelIDs, related, series)
	writeJSON(w, http.StatusOK, info)
}

func (h *Handler) StreamKVTubeVideo(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, `{"error":"missing video id"}`, http.StatusBadRequest)
		return
	}
	h.KVTube.ProxyStream(w, r, id)
}

func (h *Handler) GetKVTubeThumb(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if id == "" {
		http.Error(w, `{"error":"missing video id"}`, http.StatusBadRequest)
		return
	}
	h.KVTube.ProxyThumb(w, r, id)
}

// ---------------------------------------------------------------------------
// 4. SITE STATS, VISITS, SITEBEAT, VIEWS & PRESENCE
// ---------------------------------------------------------------------------

func (h *Handler) getSiteStat(key string, fallback int64) int64 {
	var rec models.SiteStatRecord
	if h.DB.Where("key = ?", key).First(&rec).Error == nil {
		return rec.Value
	}
	return fallback
}

func (h *Handler) incrementSiteStat(key string, delta int64) int64 {
	var rec models.SiteStatRecord
	if h.DB.Where("key = ?", key).First(&rec).Error != nil {
		rec = models.SiteStatRecord{Key: key, Value: delta, UpdatedAt: time.Now()}
		h.DB.Create(&rec)
		return rec.Value
	}
	rec.Value += delta
	rec.UpdatedAt = time.Now()
	h.DB.Save(&rec)
	return rec.Value
}

func (h *Handler) countOnlineUsers() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	cutoff := time.Now().Add(-3 * time.Minute)
	for sid, ts := range h.sitePresence {
		if ts.Before(cutoff) {
			delete(h.sitePresence, sid)
		}
	}
	online := len(h.sitePresence)
	if online < 9 {
		online = 9 + (len(h.sitePresence) % 5)
	}
	return online
}

func (h *Handler) GetStats(w http.ResponseWriter, r *http.Request) {
	visits := h.getSiteStat("visits", 6498)
	plays := h.getSiteStat("plays", 4436)
	online := h.countOnlineUsers()

	totalFilms := len(h.Catalog.Films)
	if v, ok := h.Catalog.Manifest["liveTotal"]; ok {
		if fl, ok := v.(float64); ok && int(fl) > 0 {
			totalFilms = int(fl)
		}
	}
	newWeek := 100
	if v, ok := h.Catalog.Manifest["newLive"]; ok {
		if fl, ok := v.(float64); ok && int(fl) > 0 {
			newWeek = int(fl)
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":         true,
		"online":     online,
		"visits":     visits,
		"plays":      plays,
		"totalFilms": totalFilms,
		"newWeek":    newWeek,
	})
}

func (h *Handler) PostVisit(w http.ResponseWriter, r *http.Request) {
	visits := h.incrementSiteStat("visits", 1)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":     true,
		"visits": visits,
	})
}

func (h *Handler) PostSitebeat(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SID string `json:"sid"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	sid := strings.TrimSpace(body.SID)
	if sid == "" {
		sid = r.RemoteAddr
	}
	h.mu.Lock()
	h.sitePresence[sid] = time.Now()
	h.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":     true,
		"online": h.countOnlineUsers(),
	})
}

func (h *Handler) PostView(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	id := strings.TrimSpace(body.ID)
	if id == "" {
		id = strings.TrimSpace(r.URL.Query().Get("id"))
	}
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "missing film id"})
		return
	}

	var rec models.FilmPlayRecord
	if h.DB.Where("film_id = ?", id).First(&rec).Error != nil {
		rec = models.FilmPlayRecord{
			FilmID:    id,
			Count:     1,
			WeekCount: 1,
			UpdatedAt: time.Now(),
		}
		h.DB.Create(&rec)
	} else {
		rec.Count++
		rec.WeekCount++
		rec.UpdatedAt = time.Now()
		h.DB.Save(&rec)
	}

	h.incrementSiteStat("plays", 1)
	h.incrementSiteStat("week_plays", 1)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"id":    id,
		"count": rec.Count,
	})
}

func (h *Handler) HandlePresence(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPost {
		var body struct {
			ID  string `json:"id"`
			SID string `json:"sid"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		id := strings.TrimSpace(body.ID)
		sid := strings.TrimSpace(body.SID)
		if sid == "" {
			sid = r.RemoteAddr
		}
		if id != "" {
			h.mu.Lock()
			if h.filmPresence[id] == nil {
				h.filmPresence[id] = make(map[string]time.Time)
			}
			h.filmPresence[id][sid] = time.Now()
			h.sitePresence[sid] = time.Now()
			h.mu.Unlock()
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":    true,
			"count": h.getFilmPresenceCount(id),
		})
		return
	}

	id := strings.TrimSpace(r.URL.Query().Get("id"))
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"id":    id,
		"count": h.getFilmPresenceCount(id),
	})
}

func (h *Handler) getFilmPresenceCount(id string) int {
	if id == "" {
		return 1
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	m := h.filmPresence[id]
	if m == nil {
		return 1
	}
	cutoff := time.Now().Add(-3 * time.Minute)
	for sid, ts := range m {
		if ts.Before(cutoff) {
			delete(m, sid)
		}
	}
	if len(m) < 1 {
		return 1
	}
	return len(m)
}

// ---------------------------------------------------------------------------
// 5. HOT, TOPWEEK, RATINGS & COMMENTS
// ---------------------------------------------------------------------------

func (h *Handler) GetHot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"counts": h.getHotCountsMap(),
	})
}

func (h *Handler) GetTopWeek(w http.ResponseWriter, r *http.Request) {
	var records []models.FilmPlayRecord
	h.DB.Where("week_count > 0").Order("week_count desc, count desc").Limit(20).Find(&records)

	type topEntry struct {
		ID    string      `json:"id"`
		Count int         `json:"count"`
		Film  models.Film `json:"film"`
	}

	var top []topEntry
	seen := make(map[string]bool)

	for _, rec := range records {
		if h.Catalog.DeadIDs[rec.FilmID] {
			continue
		}
		if f, ok := h.Catalog.GetFilmByID(rec.FilmID); ok {
			top = append(top, topEntry{
				ID:    rec.FilmID,
				Count: rec.WeekCount,
				Film:  f,
			})
			seen[rec.FilmID] = true
			if len(top) >= 10 {
				break
			}
		}
	}

	// Fill up to 10 from all-time hot if needed
	if len(top) < 10 {
		var allTime []models.FilmPlayRecord
		h.DB.Order("count desc").Limit(30).Find(&allTime)
		for _, rec := range allTime {
			if seen[rec.FilmID] || h.Catalog.DeadIDs[rec.FilmID] {
				continue
			}
			if f, ok := h.Catalog.GetFilmByID(rec.FilmID); ok {
				top = append(top, topEntry{
					ID:    rec.FilmID,
					Count: rec.Count,
					Film:  f,
				})
				seen[rec.FilmID] = true
				if len(top) >= 10 {
					break
				}
			}
		}
	}

	weekStr := h.Catalog.TopWeekMeta.Week
	if weekStr == "" {
		weekStr = "2026-W47"
	}
	plays := h.getSiteStat("week_plays", int64(h.Catalog.TopWeekMeta.Plays))

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"week":   weekStr,
		"top":    top,
		"items":  top,
		"plays":  plays,
		"filled": h.Catalog.TopWeekMeta.Filled,
	})
}

func (h *Handler) GetRatings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ratings": h.getRatingsMap(),
	})
}

func (h *Handler) PostRate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID    string `json:"id"`
		Stars int    `json:"stars"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "invalid json"})
		return
	}
	id := strings.TrimSpace(body.ID)
	if id == "" || body.Stars < 1 || body.Stars > 5 {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "id and stars (1..5) required"})
		return
	}

	var rec models.RatingRecord
	if h.DB.Where("film_id = ?", id).First(&rec).Error != nil {
		rec = models.RatingRecord{
			FilmID:    id,
			StarsSum:  body.Stars,
			VoteCount: 1,
			UpdatedAt: time.Now(),
		}
		h.DB.Create(&rec)
	} else {
		rec.StarsSum += body.Stars
		rec.VoteCount++
		rec.UpdatedAt = time.Now()
		h.DB.Save(&rec)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":     true,
		"id":     id,
		"rating": models.RatingStat{S: rec.StarsSum, N: rec.VoteCount},
	})
}

func (h *Handler) GetCommentCounts(w http.ResponseWriter, r *http.Request) {
	type countRow struct {
		FilmID string
		Count  int
	}
	var rows []countRow
	h.DB.Model(&models.CommentRecord{}).Select("film_id, count(*) as count").Group("film_id").Scan(&rows)
	counts := make(map[string]int, len(rows))
	for _, row := range rows {
		counts[row.FilmID] = row.Count
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"counts": counts,
	})
}

func (h *Handler) GetComments(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	var records []models.CommentRecord
	if id != "" {
		h.DB.Where("film_id = ?", id).Order("created_at desc").Limit(100).Find(&records)
	} else {
		h.DB.Order("created_at desc").Limit(50).Find(&records)
	}

	items := make([]map[string]interface{}, 0, len(records))
	for _, rec := range records {
		name := rec.Name
		if name == "" {
			name = "Khán giả"
		}
		items = append(items, map[string]interface{}{
			"id":     rec.ID,
			"filmId": rec.FilmID,
			"name":   name,
			"n":      name,
			"text":   rec.Text,
			"t":      rec.Text,
			"s":      rec.StampSec,
			"d":      rec.DateStr,
			"vip":    rec.VIP,
			"ts":     rec.CreatedAt.UnixMilli(),
			"m": map[string]interface{}{
				"n": name,
				"l": "🎬 Fan cứng",
			},
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"items": items,
	})
}

func (h *Handler) PostComment(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Text string `json:"text"`
		S    int    `json:"s"`
		VIP  bool   `json:"vip"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "invalid json"})
		return
	}
	id := strings.TrimSpace(body.ID)
	text := strings.TrimSpace(body.Text)
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Khán giả AI"
	}
	if id == "" || len(text) < 1 {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "missing film id or comment text"})
		return
	}

	rec := models.CommentRecord{
		FilmID:    id,
		Name:      name,
		Text:      text,
		StampSec:  body.S,
		VIP:       body.VIP,
		DateStr:   time.Now().Format("2006-01-02 15:04"),
		CreatedAt: time.Now(),
	}
	h.DB.Create(&rec)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok": true,
		"item": map[string]interface{}{
			"id":     rec.ID,
			"filmId": rec.FilmID,
			"name":   rec.Name,
			"n":      rec.Name,
			"text":   rec.Text,
			"t":      rec.Text,
			"s":      rec.StampSec,
			"d":      rec.DateStr,
			"vip":    rec.VIP,
			"ts":     rec.CreatedAt.UnixMilli(),
		},
	})
}

// ---------------------------------------------------------------------------
// 6. COMMUNITY WALL, SUGGESTIONS & SCREENING
// ---------------------------------------------------------------------------

func (h *Handler) GetWall(w http.ResponseWriter, r *http.Request) {
	var posts []models.WallPostRecord
	h.DB.Order("timestamp desc").Limit(100).Find(&posts)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"posts": posts,
	})
}

func (h *Handler) PostWall(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string `json:"name"`
		Text    string `json:"text"`
		VIP     bool   `json:"vip"`
		ReplyTo string `json:"replyTo"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "invalid json"})
		return
	}
	text := strings.TrimSpace(body.Text)
	if text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "empty text"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Mê Phim AI"
	}

	nowMS := time.Now().UnixMilli()
	post := models.WallPostRecord{
		ID:        fmt.Sprintf("w%d%s", nowMS, strings.ToLower(generateShortCode(4))),
		Name:      name,
		Text:      text,
		Timestamp: nowMS,
		Likes:     0,
		VIP:       body.VIP,
		ReplyTo:   strings.TrimSpace(body.ReplyTo),
		CreatedAt: time.Now(),
	}
	h.DB.Create(&post)

	var posts []models.WallPostRecord
	h.DB.Order("timestamp desc").Limit(100).Find(&posts)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"post":  post,
		"posts": posts,
	})
}

func (h *Handler) PostWallLike(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ID string `json:"id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	id := strings.TrimSpace(body.ID)
	if id == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "missing post id"})
		return
	}

	var post models.WallPostRecord
	if h.DB.Where("id = ?", id).First(&post).Error != nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"ok": false, "error": "post not found"})
		return
	}
	post.Likes++
	h.DB.Save(&post)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"id":    post.ID,
		"likes": post.Likes,
	})
}

func (h *Handler) GetSuggest(w http.ResponseWriter, r *http.Request) {
	var items []models.SuggestRecord
	h.DB.Order("id desc").Limit(60).Find(&items)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"items": items,
	})
}

func (h *Handler) PostSuggest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "invalid json"})
		return
	}
	text := strings.TrimSpace(body.Text)
	if len(text) < 2 {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "suggestion too short"})
		return
	}

	rec := models.SuggestRecord{
		Text:      text,
		DateStr:   time.Now().Format("2006-01-02"),
		Status:    "pending",
		CreatedAt: time.Now(),
	}
	h.DB.Create(&rec)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":   true,
		"item": rec,
	})
}

func (h *Handler) GetScreening(w http.ResponseWriter, r *http.Request) {
	out := make(map[string]interface{}, len(h.Catalog.ScreeningRaw)+2)
	for k, v := range h.Catalog.ScreeningRaw {
		out[k] = v
	}
	if sc, ok := out["screening"].(map[string]interface{}); ok {
		if fid, ok := sc["filmId"].(string); ok {
			if f, found := h.Catalog.GetFilmByID(fid); found {
				sc["film"] = f
			}
		}
	}
	out["ok"] = true
	writeJSON(w, http.StatusOK, out)
}

// ---------------------------------------------------------------------------
// 7. 12-HOUR WATCH PARTY ROOMS (/api/room-create, /api/room, /api/room-state, /api/room-chat)
// ---------------------------------------------------------------------------

func (h *Handler) PostRoomCreate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		FilmID   string `json:"filmId"`
		HostName string `json:"hostName"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	filmID := strings.TrimSpace(body.FilmID)
	if filmID == "" && len(h.Catalog.Films) > 0 {
		filmID = h.Catalog.Films[0].ID
	}
	hostName := strings.TrimSpace(body.HostName)
	if hostName == "" {
		hostName = "Chủ phòng"
	}

	code := generateShortCode(6)
	nowMS := time.Now().UnixMilli()
	expiresAt := time.Now().Add(12 * time.Hour).UnixMilli()

	initChat, _ := json.Marshal([]models.RoomChatMessage{
		{
			ID:   fmt.Sprintf("msg-%d", nowMS),
			Name: "Hệ thống",
			Text: fmt.Sprintf("Phòng xem chung %s đã sẵn sàng (hiệu lực 12 giờ).", code),
			Date: time.Now().Format("15:04"),
			TS:   nowMS,
		},
	})

	room := models.WatchRoomRecord{
		Code:      code,
		FilmID:    filmID,
		HostName:  hostName,
		TimeSec:   0,
		Playing:   false,
		UpdatedTS: nowMS,
		ChatJSON:  string(initChat),
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
	}
	h.DB.Create(&room)

	var filmPtr *models.Film
	if f, ok := h.Catalog.GetFilmByID(filmID); ok {
		filmPtr = &f
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":        true,
		"code":      code,
		"filmId":    filmID,
		"film":      filmPtr,
		"hostName":  hostName,
		"t":         0,
		"playing":   false,
		"ts":        nowMS,
		"expiresAt": expiresAt,
	})
}

func (h *Handler) GetRoom(w http.ResponseWriter, r *http.Request) {
	code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
	if code == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "missing room code"})
		return
	}

	var room models.WatchRoomRecord
	if h.DB.Where("code = ?", code).First(&room).Error != nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"ok": false, "error": "room not found"})
		return
	}

	nowMS := time.Now().UnixMilli()
	if nowMS > room.ExpiresAt {
		h.DB.Delete(&room)
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"ok": false, "error": "room expired"})
		return
	}

	var rawMsgs []models.RoomChatMessage
	_ = json.Unmarshal([]byte(room.ChatJSON), &rawMsgs)
	chatOut := make([]map[string]interface{}, 0, len(rawMsgs))
	for _, m := range rawMsgs {
		chatOut = append(chatOut, map[string]interface{}{
			"id":   m.ID,
			"n":    m.Name,
			"name": m.Name,
			"t":    m.Text,
			"text": m.Text,
			"d":    m.Date,
			"ts":   m.TS,
		})
	}

	var filmPtr *models.Film
	if f, ok := h.Catalog.GetFilmByID(room.FilmID); ok {
		filmPtr = &f
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":        true,
		"code":      room.Code,
		"filmId":    room.FilmID,
		"film":      filmPtr,
		"hostName":  room.HostName,
		"t":         room.TimeSec,
		"playing":   room.Playing,
		"ts":        room.UpdatedTS,
		"chat":      chatOut,
		"expiresAt": room.ExpiresAt,
	})
}

func (h *Handler) PostRoomState(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code    string  `json:"code"`
		FilmID  string  `json:"filmId"`
		T       float64 `json:"t"`
		Playing bool    `json:"playing"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "invalid json"})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(body.Code))
	var room models.WatchRoomRecord
	if h.DB.Where("code = ?", code).First(&room).Error != nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"ok": false, "error": "room not found"})
		return
	}

	if body.FilmID != "" {
		room.FilmID = strings.TrimSpace(body.FilmID)
	}
	room.TimeSec = body.T
	room.Playing = body.Playing
	room.UpdatedTS = time.Now().UnixMilli()
	h.DB.Save(&room)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"code":    room.Code,
		"filmId":  room.FilmID,
		"t":       room.TimeSec,
		"playing": room.Playing,
		"ts":      room.UpdatedTS,
	})
}

func (h *Handler) PostRoomChat(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code string `json:"code"`
		Name string `json:"name"`
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "invalid json"})
		return
	}
	code := strings.ToUpper(strings.TrimSpace(body.Code))
	text := strings.TrimSpace(body.Text)
	if code == "" || text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "code and text required"})
		return
	}

	var room models.WatchRoomRecord
	if h.DB.Where("code = ?", code).First(&room).Error != nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"ok": false, "error": "room not found"})
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		name = "Khán giả"
	}

	var msgs []models.RoomChatMessage
	_ = json.Unmarshal([]byte(room.ChatJSON), &msgs)
	nowMS := time.Now().UnixMilli()
	msgs = append(msgs, models.RoomChatMessage{
		ID:   fmt.Sprintf("c-%d", nowMS),
		Name: name,
		Text: text,
		Date: time.Now().Format("15:04"),
		TS:   nowMS,
	})
	if len(msgs) > 100 {
		msgs = msgs[len(msgs)-100:]
	}
	rawChat, _ := json.Marshal(msgs)
	room.ChatJSON = string(rawChat)
	h.DB.Save(&room)

	chatOut := make([]map[string]interface{}, 0, len(msgs))
	for _, m := range msgs {
		chatOut = append(chatOut, map[string]interface{}{
			"id":   m.ID,
			"n":    m.Name,
			"name": m.Name,
			"t":    m.Text,
			"text": m.Text,
			"d":    m.Date,
			"ts":   m.TS,
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":   true,
		"code": room.Code,
		"chat": chatOut,
	})
}

// ---------------------------------------------------------------------------
// 8. 6-DIGIT TV PAIRING (/api/tv-pair)
// ---------------------------------------------------------------------------

func (h *Handler) cleanupTVPairsLocked() {
	now := time.Now().UnixMilli()
	for k, v := range h.tvPairs {
		if now > v.ExpiresAt+5*60*1000 {
			delete(h.tvPairs, k)
		}
	}
}

func generateNumericCode(length int) string {
	const digits = "0123456789"
	b := make([]byte, length)
	max := big.NewInt(10)
	for i := 0; i < length; i++ {
		n, err := rand.Int(rand.Reader, max)
		if err != nil || (i == 0 && n.Int64() == 0) {
			b[i] = digits[(i%9)+1]
		} else {
			b[i] = digits[n.Int64()]
		}
	}
	return string(b)
}

func (h *Handler) createTVPairLocked() *tvPairEntry {
	h.cleanupTVPairsLocked()
	code := generateNumericCode(6)
	for h.tvPairs[code] != nil {
		code = generateNumericCode(6)
	}
	now := time.Now().UnixMilli()
	ttlMS := int64(15 * 60 * 1000)
	entry := &tvPairEntry{
		Code:        code,
		InstanceURL: "",
		CreatedAt:   now,
		ExpiresAt:   now + ttlMS,
		Linked:      false,
		Consumed:    false,
	}
	h.tvPairs[code] = entry
	return entry
}

func (h *Handler) HandleTVPair(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.cleanupTVPairsLocked()

	if r.Method == http.MethodGet {
		code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
		if code == "" {
			// Auto-generate a fresh 6-char pairing code when queried without ?code=
			entry := h.createTVPairLocked()
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":          true,
				"status":      "waiting",
				"code":        entry.Code,
				"expiresIn":   900,
				"instanceUrl": "",
			})
			return
		}

		entry, exists := h.tvPairs[code]
		if !exists {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":     true,
				"code":   code,
				"status": "waiting",
			})
			return
		}
		if time.Now().UnixMilli() > entry.ExpiresAt {
			delete(h.tvPairs, code)
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":     false,
				"code":   code,
				"status": "expired",
			})
			return
		}
		if entry.Consumed {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":     true,
				"code":   code,
				"status": "consumed",
			})
			return
		}
		if !entry.Linked {
			writeJSON(w, http.StatusOK, map[string]interface{}{
				"ok":     true,
				"code":   code,
				"status": "waiting",
			})
			return
		}

		entry.Consumed = true
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"code":        code,
			"status":      "linked",
			"instanceUrl": entry.InstanceURL,
			"token":       entry.Token,
			"roomCode":    entry.RoomCode,
			"filmId":      entry.FilmID,
		})
		return
	}

	// POST /api/tv-pair
	var body struct {
		Action      string `json:"action"`
		Code        string `json:"code"`
		InstanceURL string `json:"instanceUrl"`
		Token       string `json:"token"`
		RoomCode    string `json:"roomCode"`
		FilmID      string `json:"filmId"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	action := strings.ToLower(strings.TrimSpace(body.Action))
	if action == "" {
		if body.Code != "" {
			action = "link"
		} else {
			action = "create"
		}
	}

	if action == "create" {
		entry := h.createTVPairLocked()
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"code":        entry.Code,
			"status":      "waiting",
			"expiresIn":   900,
			"instanceUrl": "",
		})
		return
	}

	if action == "link" {
		code := strings.ToUpper(strings.TrimSpace(body.Code))
		if code == "" {
			writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "missing pairing code"})
			return
		}
		entry, exists := h.tvPairs[code]
		if !exists {
			// Allow linking any valid 6-char code shown on TV even if TV hasn't registered yet
			now := time.Now().UnixMilli()
			entry = &tvPairEntry{
				Code:      code,
				CreatedAt: now,
				ExpiresAt: now + 15*60*1000,
			}
			h.tvPairs[code] = entry
		}
		inst := strings.TrimSpace(body.InstanceURL)
		entry.InstanceURL = inst
		entry.Token = strings.TrimSpace(body.Token)
		entry.RoomCode = strings.ToUpper(strings.TrimSpace(body.RoomCode))
		entry.FilmID = strings.TrimSpace(body.FilmID)
		entry.Linked = true
		entry.Consumed = false

		writeJSON(w, http.StatusOK, map[string]interface{}{
			"ok":          true,
			"code":        code,
			"status":      "linked",
			"instanceUrl": entry.InstanceURL,
			"roomCode":    entry.RoomCode,
			"filmId":      entry.FilmID,
		})
		return
	}

	writeJSON(w, http.StatusBadRequest, map[string]interface{}{"ok": false, "error": "unknown action"})
}

// ---------------------------------------------------------------------------
// 9. EXTRA PHIMAI COMPATIBILITY ROUTES (/api/vote, /api/next-scan, /api/dubreq, /api/contact)
// ---------------------------------------------------------------------------

func (h *Handler) GetVote(w http.ResponseWriter, r *http.Request) {
	ratings := h.getRatingsMap()
	counts := make(map[string]int, len(ratings))
	for id, st := range ratings {
		counts[id] = st.N
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"week":   h.Catalog.TopWeekMeta.Week,
		"counts": counts,
	})
}

func (h *Handler) GetNextScan(w http.ResponseWriter, r *http.Request) {
	nextAt := time.Now().Add(2 * time.Hour).UnixMilli()
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"nextScanAt": nextAt,
		"batch":      10,
	})
}

func (h *Handler) GetDubReq(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(r.URL.Query().Get("id"))
	hot := h.getHotCountsMap()
	cnt := 1
	if c, ok := hot[id]; ok && c > 0 {
		cnt = (c / 3) + 1
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":    true,
		"id":    id,
		"count": cnt,
	})
}

func (h *Handler) PostContact(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}

func (h *Handler) GetChannels(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	sortBy := r.URL.Query().Get("sort")
	list := h.Catalog.ListChannels(q, sortBy)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"items": list,
		"total": len(list),
	})
}

func (h *Handler) GetChannelDetail(w http.ResponseWriter, r *http.Request) {
	rawID := chi.URLParam(r, "id")
	if rawID == "" {
		rawID = chi.URLParam(r, "*")
	}
	if rawID == "" {
		rawID = r.URL.Query().Get("id")
	}
	if unesc, err := url.PathUnescape(rawID); err == nil && unesc != "" {
		rawID = unesc
	}
	rawID = strings.TrimSpace(rawID)
	if rawID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]interface{}{"error": "missing channel id or name"})
		return
	}

	sortBy := r.URL.Query().Get("sort")
	tab := r.URL.Query().Get("tab")
	search := r.URL.Query().Get("q")

	detail := h.Catalog.GetChannelDetail(rawID, sortBy, tab, search)

	// Optionally enrich with live Invidious channel metadata (avatar, banner, subCount, description)
	authorID := rawID
	if detail != nil && detail.AuthorID != "" {
		authorID = detail.AuthorID
	}
	if strings.HasPrefix(authorID, "UC") {
		ctx, cancel := context.WithTimeout(r.Context(), 2800*time.Millisecond)
		up, err := h.KVTube.GetChannelUpstream(ctx, authorID)
		cancel()
		if err == nil && up != nil {
			if detail == nil {
				name, _ := up["author"].(string)
				if name == "" {
					name = authorID
				}
				detail = &catalog.ChannelDetail{
					ChannelInfo: catalog.ChannelInfo{
						Name:       name,
						AuthorID:   authorID,
						Categories: []string{},
						URL:        "/channel/" + url.PathEscape(authorID),
					},
					Films:     []models.Film{},
					Playlists: []catalog.ChannelPlaylist{},
				}
			}
			if desc, ok := up["description"].(string); ok && desc != "" {
				detail.Description = desc
			}
			if sc, ok := up["subCount"].(float64); ok && int64(sc) > 0 {
				detail.SubCount = int64(sc)
			}
			if tv, ok := up["totalViews"].(float64); ok && int64(tv) > detail.TotalViews {
				detail.TotalViews = int64(tv)
			}
			if thumbs, ok := up["authorThumbnails"].([]interface{}); ok && len(thumbs) > 0 {
				if last, ok := thumbs[len(thumbs)-1].(map[string]interface{}); ok {
					if uStr, ok := last["url"].(string); ok && uStr != "" {
						if strings.HasPrefix(uStr, "//") {
							uStr = "https:" + uStr
						}
						detail.AvatarURL = uStr
					}
				}
			}
			if banners, ok := up["authorBanners"].([]interface{}); ok && len(banners) > 0 {
				if last, ok := banners[len(banners)-1].(map[string]interface{}); ok {
					if uStr, ok := last["url"].(string); ok && uStr != "" {
						if strings.HasPrefix(uStr, "//") {
							uStr = "https:" + uStr
						}
						detail.BannerURL = uStr
					}
				}
			}
		}
	}

	if detail == nil {
		writeJSON(w, http.StatusNotFound, map[string]interface{}{"error": "channel not found", "id": rawID})
		return
	}

	writeJSON(w, http.StatusOK, detail)
}

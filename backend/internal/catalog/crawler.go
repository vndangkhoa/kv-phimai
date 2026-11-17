package catalog

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"phimai-backend/internal/kvtube"
	"phimai-backend/internal/models"
)

var rePlaylistID = regexp.MustCompile(`(?i)[?&]list=([A-Za-z0-9_-]{12,})`)

type CrawlerStatus struct {
	IsRunning    bool          `json:"isRunning"`
	LastCrawlAt  string        `json:"lastCrawlAt,omitempty"`
	TotalCrawled int           `json:"totalCrawled"`
	LastNewAdded int           `json:"lastNewAdded"`
	LastError    string        `json:"lastError,omitempty"`
	LiveFilms    int           `json:"liveFilms"`
	TotalFilms   int           `json:"totalFilms"`
	BaseMaxRank  int           `json:"baseMaxRank"`
	RecentFilms  []models.Film `json:"recentFilms"`
}

var aiDiscoveryQueries = []struct {
	Query      string
	SortByDate bool
	DefaultCat string
}{
	{Query: "Phim AI thuyết minh full mới nhất", SortByDate: true, DefaultCat: "dai"},
	{Query: "Phim ngắn AI kịch tính full", SortByDate: true, DefaultCat: "ngan"},
	{Query: "Short drama vietsub thuyết minh full", SortByDate: true, DefaultCat: "ngan"},
	{Query: "Phim ngắn tổng tài báo thù thuyết minh full", SortByDate: true, DefaultCat: "ngan"},
	{Query: "Hoạt hình 3D AI tu tiên mới nhất", SortByDate: true, DefaultCat: "trung"},
	{Query: "Phim AI kinh dị hệ thống sinh tồn", SortByDate: true, DefaultCat: "kinhdi"},
	{Query: "AI short film Sora Runway Veo Kling", SortByDate: true, DefaultCat: "scifi"},
	{Query: "Phim AI cổ trang xuyên không trọng sinh full", SortByDate: true, DefaultCat: "trung"},
}

func (c *Catalog) loadCrawledFilmsFile(filmMap map[string]models.Film, path string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	var list []models.Film
	if err := json.Unmarshal(raw, &list); err != nil {
		return
	}
	var recent []models.Film
	for _, f := range list {
		if f.ID == "" || c.DeadIDs[f.ID] {
			continue
		}
		if f.Rank <= 0 {
			c.BaseMaxRank++
			f.Rank = c.BaseMaxRank
		}
		c.CrawledIDs[f.ID] = true
		filmMap[f.ID] = f
		recent = append(recent, f)
	}
	sort.Slice(recent, func(i, j int) bool {
		return recent[i].Rank > recent[j].Rank
	})
	c.TotalCrawled = len(c.CrawledIDs)
	if len(recent) > 12 {
		recent = recent[:12]
	}
	c.RecentCrawled = recent
}

func (c *Catalog) persistCrawledFilmsLocked() {
	var crawled []models.Film
	for _, f := range c.Films {
		if c.CrawledIDs[f.ID] && !c.DeadIDs[f.ID] {
			crawled = append(crawled, f)
		}
	}
	sort.Slice(crawled, func(i, j int) bool {
		return crawled[i].Rank > crawled[j].Rank
	})
	path := filepath.Join(c.DataDir, "crawled-films.json")
	if b, err := json.MarshalIndent(crawled, "", "  "); err == nil {
		tmpPath := path + ".tmp"
		if os.WriteFile(tmpPath, b, 0644) == nil {
			_ = os.Rename(tmpPath, path)
		} else {
			_ = os.WriteFile(path, b, 0644)
		}
	}
}

func (c *Catalog) rebuildManifestCountsLocked() {
	if c.Manifest == nil {
		c.Manifest = make(map[string]interface{})
	}
	newCut := 9068
	if nc, ok := c.Manifest["newCut"]; ok {
		if n := toInt(nc); n > 0 {
			newCut = n
		}
	}

	cats := map[string]int{
		"all":      0,
		"new":      0,
		"fantasy":  0,
		"trung":    0,
		"hoathinh": 0,
		"scifi":    0,
		"kinhdi":   0,
		"vietnam":  0,
		"dai":      0,
		"ngan":     0,
	}

	liveTotal := 0
	for _, f := range c.Films {
		if c.DeadIDs[f.ID] {
			continue
		}
		liveTotal++
		cats["all"]++
		if f.Rank > newCut {
			cats["new"]++
		}
		if f.IsFull || f.DurMins >= 60 {
			cats["dai"]++
		} else {
			cats["ngan"]++
		}
		if f.Cat != "" && f.Cat != "dai" && f.Cat != "ngan" {
			cats[f.Cat]++
		}
	}

	c.Manifest["liveTotal"] = liveTotal
	c.Manifest["newLive"] = cats["new"]
	c.Manifest["cats"] = cats
}

// GetManifestSnapshot returns a thread-safe shallow copy of Manifest + Playlists.
func (c *Catalog) GetManifestSnapshot() map[string]interface{} {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make(map[string]interface{}, len(c.Manifest)+2)
	for k, v := range c.Manifest {
		if k == "cats" {
			if mInt, ok := v.(map[string]int); ok {
				cp := make(map[string]int, len(mInt))
				for ck, cv := range mInt {
					cp[ck] = cv
				}
				out[k] = cp
				continue
			}
		}
		out[k] = v
	}
	out["playlists"] = c.Playlists
	return out
}

// GetLiveCounts returns totalFilms and liveTotal safely.
func (c *Catalog) GetLiveCounts() (int, int) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	live := len(c.Films) - len(c.DeadIDs)
	if v, ok := c.Manifest["liveTotal"]; ok {
		switch n := v.(type) {
		case int:
			if n > 0 {
				live = n
			}
		case float64:
			if int(n) > 0 {
				live = int(n)
			}
		}
	}
	return len(c.Films), live
}

// GetCrawlerStatus returns current auto-crawler telemetry and recently crawled films.
func (c *Catalog) GetCrawlerStatus() CrawlerStatus {
	c.mu.RLock()
	defer c.mu.RUnlock()
	live := len(c.Films) - len(c.DeadIDs)
	recent := make([]models.Film, len(c.RecentCrawled))
	copy(recent, c.RecentCrawled)
	lastAt := ""
	if !c.LastCrawlAt.IsZero() {
		lastAt = c.LastCrawlAt.UTC().Format(time.RFC3339)
	}
	return CrawlerStatus{
		IsRunning:    c.CrawlRunning,
		LastCrawlAt:  lastAt,
		TotalCrawled: c.TotalCrawled,
		LastNewAdded: c.LastCrawlAdded,
		LastError:    c.LastCrawlError,
		LiveFilms:    live,
		TotalFilms:   len(c.Films),
		BaseMaxRank:  c.BaseMaxRank,
		RecentFilms:  recent,
	}
}

func formatCrawledDur(lengthSeconds int) string {
	if lengthSeconds <= 0 {
		return "30 phút"
	}
	mins := (lengthSeconds + 30) / 60
	if mins < 1 {
		mins = 1
	}
	if mins >= 60 {
		h := mins / 60
		m := mins % 60
		if m > 0 {
			return fmt.Sprintf("%d giờ %d phút", h, m)
		}
		return fmt.Sprintf("%d giờ", h)
	}
	return fmt.Sprintf("%d phút", mins)
}

func classifyCrawledVideo(item kvtube.CrawledVideoItem, defaultCat string, isTrustedChannel bool) (models.Film, bool) {
	id := strings.TrimSpace(item.VideoID)
	title := strings.TrimSpace(item.Title)
	if len(id) < 6 || title == "" {
		return models.Film{}, false
	}
	// Require concrete duration between 60s and 5h (skip empty/live 0s and tiny Shorts < 60s)
	if item.LengthSeconds < 60 || item.LengthSeconds > 18000 {
		return models.Film{}, false
	}

	normAll := ViNorm(title + " " + item.Description + " " + item.Channel)
	if !isTrustedChannel {
		// Ensure candidate from generic search actually looks like AI video / short drama / anime / phim
		relevant := containsAny(normAll,
			"phim ai", "ai film", "short drama", "phim ngan", "thuyet minh",
			"tu tien", "tien hiep", "huyen huyen", "xuyen khong", "trong sinh",
			"tong tai", "he thong", "mat the", "co trang", "hoat hinh",
			"sora", "runway", "kling", "veo", "vietsub", "review phim",
		)
		if !relevant {
			return models.Film{}, false
		}
	}

	cat := defaultCat
	if cat == "" {
		cat = "dai"
	}
	switch {
	case containsAny(normAll, "su viet", "lich su viet", "phim viet"):
		cat = "vietnam"
	case containsAny(normAll, "kinh di", "ma am", "quy di", "am anh", "zombie", "mat the"):
		cat = "kinhdi"
	case containsAny(normAll, "vien tuong", "sci fi", "scifi", "tuong lai", "vu tru", "robot", "cyberpunk"):
		cat = "scifi"
	case containsAny(normAll, "tu tien", "tien hiep", "huyen huyen", "co trang", "kiem hiep", "cung dau", "xuyen khong", "trong sinh"):
		cat = "trung"
	case containsAny(normAll, "hoat hinh", "3d", "anime", "chibi"):
		cat = "hoathinh"
	case containsAny(normAll, "than thoai", "fantasy", "phep thuat", "ky ao", "ma phap"):
		cat = "fantasy"
	case item.LengthSeconds <= 1500 || containsAny(normAll, "phim ngan", "short drama", "short film"):
		cat = "ngan"
	case item.LengthSeconds >= 3600:
		cat = "dai"
	}

	tool := "AI"
	switch {
	case containsAny(normAll, "short drama", "tong tai", "phim ngan"):
		tool = "Short Drama"
	case strings.Contains(normAll, "veo"):
		tool = "Veo"
	case strings.Contains(normAll, "sora"):
		tool = "Sora"
	case strings.Contains(normAll, "runway"):
		tool = "Runway"
	case strings.Contains(normAll, "kling"):
		tool = "Kling"
	}

	var tags []string
	seenTags := map[string]bool{}
	addTag := func(t string) {
		if t != "" && !seenTags[t] {
			seenTags[t] = true
			tags = append(tags, t)
		}
	}
	addTag("moi-nhat")
	if strings.Contains(normAll, "short drama") || cat == "ngan" {
		addTag("short-drama")
	}
	for groupName, keywords := range genreGroups {
		for _, kw := range keywords {
			if strings.Contains(normAll, ViNorm(kw)) {
				addTag(groupName)
				break
			}
		}
	}
	if len(tags) == 1 {
		addTag(cat)
	}

	channel := strings.TrimSpace(item.Channel)
	if channel == "" {
		channel = "PhimAI Studio"
	}
	durStr := formatCrawledDur(item.LengthSeconds)
	if strings.Contains(normAll, "full") && !strings.Contains(strings.ToLower(durStr), "full") {
		// preserve clean duration string while marking full via title/blurb
	}

	viewsStr := "1200"
	if item.ViewCount > 0 {
		viewsStr = strconv.FormatInt(item.ViewCount, 10)
	}

	blurb := strings.TrimSpace(item.Description)
	if blurb == "" {
		if item.PublishedText != "" {
			blurb = fmt.Sprintf("Phát hành %s • %s (%s)", item.PublishedText, channel, durStr)
		} else {
			blurb = fmt.Sprintf("Tự động cập nhật mới nhất từ %s (%s)", channel, durStr)
		}
	}

	return models.Film{
		ID:        id,
		Title:     title,
		Channel:   channel,
		Views:     viewsStr,
		Dur:       durStr,
		Cat:       cat,
		Tool:      tool,
		Blurb:     blurb,
		BlurbLong: item.Description,
		Tags:      tags,
	}, true
}

// AddCrawledFilms merges newly crawled films into the live catalog and persists crawled-films.json.
func (c *Catalog) AddCrawledFilms(candidates []models.Film) (int, []models.Film) {
	if len(candidates) == 0 {
		return 0, nil
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	maxRank := c.BaseMaxRank
	for _, f := range c.Films {
		if f.Rank > maxRank {
			maxRank = f.Rank
		}
	}

	var added []models.Film
	for _, f := range candidates {
		if f.ID == "" || c.DeadIDs[f.ID] {
			continue
		}
		if _, exists := c.ByID[f.ID]; exists {
			continue
		}
		maxRank++
		f.Rank = maxRank
		c.enrichFilm(&f)
		c.CrawledIDs[f.ID] = true
		c.Films = append(c.Films, f)
		added = append(added, f)
	}

	if len(added) == 0 {
		return 0, nil
	}

	sort.Slice(c.Films, func(i, j int) bool {
		return c.Films[i].Rank > c.Films[j].Rank
	})
	c.ByID = make(map[string]*models.Film, len(c.Films))
	c.ByRank = make(map[int]*models.Film, len(c.Films))
	for i := range c.Films {
		fp := &c.Films[i]
		c.ByID[fp.ID] = fp
		c.ByRank[fp.Rank] = fp
	}

	c.TotalCrawled = len(c.CrawledIDs)
	c.LastCrawlAdded = len(added)

	// Update RecentCrawled slice with newest first
	var mergedRecent []models.Film
	mergedRecent = append(mergedRecent, added...)
	sort.Slice(mergedRecent, func(i, j int) bool {
		return mergedRecent[i].Rank > mergedRecent[j].Rank
	})
	seenRec := make(map[string]bool, 12)
	var topRecent []models.Film
	for _, f := range mergedRecent {
		if !seenRec[f.ID] {
			seenRec[f.ID] = true
			topRecent = append(topRecent, f)
		}
	}
	for _, f := range c.RecentCrawled {
		if !seenRec[f.ID] && len(topRecent) < 12 {
			seenRec[f.ID] = true
			topRecent = append(topRecent, f)
		}
	}
	if len(topRecent) > 12 {
		topRecent = topRecent[:12]
	}
	c.RecentCrawled = topRecent

	c.buildSeriesGroups()
	c.rebuildManifestCountsLocked()
	c.persistCrawledFilmsLocked()

	log.Printf("[AutoCrawler] Added %d new AI/Short Drama releases (catalog live: %d)", len(added), len(c.Films)-len(c.DeadIDs))
	return len(added), added
}

// GetChannelAuthorID looks up a channel's YouTube author ID thread-safely.
func (c *Catalog) GetChannelAuthorID(channelName string) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	if id, ok := c.ChannelIDs[channelName]; ok {
		return id
	}
	normTarget := ViNorm(channelName)
	for k, v := range c.ChannelIDs {
		if ViNorm(k) == normTarget {
			return v
		}
	}
	return ""
}

// DiscoverSeriesEpisodes automatically discovers and adds missing episodes ("Tập 1, Tập 2, Tập 3...")
// belonging to the same movie as filmID using official playlist links, YouTube search, and channel uploads.
func (c *Catalog) DiscoverSeriesEpisodes(ctx context.Context, kvt *kvtube.Service, filmID string, force bool) (int, []models.Film) {
	if kvt == nil {
		return 0, c.GetSeries(filmID)
	}
	film, ok := c.GetFilmByID(filmID)
	if !ok {
		return 0, nil
	}

	seriesKey, baseTitleRaw, _, hasPart := ExtractSeriesInfo(film.Title, film.Channel)
	existingSeries := c.GetSeries(filmID)
	normBase := ViNorm(baseTitleRaw)
	if seriesKey == "" || len(strings.Fields(normBase)) < 2 {
		return 0, existingSeries
	}
	if !hasPart && len(existingSeries) < 2 {
		// Only auto-expand single movies that look episodic or belong to a playlist
		descAll := film.Blurb + " " + film.BlurbLong
		if !rePlaylistID.MatchString(descAll) {
			return 0, existingSeries
		}
	}

	// Throttle repeated automatic lookups for the same series to 5 minutes unless explicitly forced
	c.mu.Lock()
	if c.SeriesCrawlAt == nil {
		c.SeriesCrawlAt = make(map[string]time.Time)
	}
	lastRun, seen := c.SeriesCrawlAt[seriesKey]
	if !force && seen && time.Since(lastRun) < 5*time.Minute {
		c.mu.Unlock()
		return 0, existingSeries
	}
	c.SeriesCrawlAt[seriesKey] = time.Now()
	c.mu.Unlock()

	var discovered []kvtube.CrawledVideoItem
	seenVid := make(map[string]bool)
	addRaw := func(items []kvtube.CrawledVideoItem) {
		for _, it := range items {
			if it.VideoID != "" && !seenVid[it.VideoID] {
				seenVid[it.VideoID] = true
				discovered = append(discovered, it)
			}
		}
	}

	// 1. Check for official YouTube playlist link inside blurb / blurbLong / live upstream description
	playlistID := ""
	if m := rePlaylistID.FindStringSubmatch(film.BlurbLong + " " + film.Blurb); len(m) >= 2 {
		playlistID = m[1]
	}
	if playlistID == "" {
		infoCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		vInfo := kvt.GetVideo(infoCtx, film.ID, &film, nil, nil, nil)
		cancel()
		if vInfo.Description != "" {
			if m := rePlaylistID.FindStringSubmatch(vInfo.Description); len(m) >= 2 {
				playlistID = m[1]
			}
		}
		if vInfo.AuthorID != "" && film.Channel != "" {
			c.mu.Lock()
			if c.ChannelIDs[film.Channel] == "" {
				c.ChannelIDs[film.Channel] = vInfo.AuthorID
			}
			c.mu.Unlock()
		}
	}
	if playlistID != "" && !strings.EqualFold(playlistID, "WL") && !strings.EqualFold(playlistID, "LL") {
		plCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		if plItems, err := kvt.FetchPlaylistVideos(plCtx, playlistID, film.Channel); err == nil {
			addRaw(plItems)
		}
		cancel()
	}

	// 2. Targeted YouTube / Invidious search for all episodes of this exact movie
	queries := []struct {
		q          string
		sortByDate bool
	}{
		{q: fmt.Sprintf("%s Tập %s", baseTitleRaw, film.Channel), sortByDate: false},
		{q: fmt.Sprintf("\"%s\" Tập", baseTitleRaw), sortByDate: false},
		{q: fmt.Sprintf("%s Tập", baseTitleRaw), sortByDate: false},
		{q: fmt.Sprintf("%s Tập", baseTitleRaw), sortByDate: true},
	}
	for _, qc := range queries {
		if ctx.Err() != nil {
			break
		}
		qCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
		if items, err := kvt.SearchLatestVideos(qCtx, qc.q, qc.sortByDate); err == nil {
			addRaw(items)
		}
		cancel()
	}

	// 3. Check channel's latest videos if we know its YouTube UC... channel ID
	if aid := c.GetChannelAuthorID(film.Channel); strings.HasPrefix(aid, "UC") && ctx.Err() == nil {
		chCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
		if chItems, err := kvt.FetchChannelLatestVideos(chCtx, aid, film.Channel); err == nil {
			addRaw(chItems)
		}
		cancel()
	}

	normFilmCh := ViNorm(film.Channel)
	var newFilms []models.Film
	for _, raw := range discovered {
		if raw.LengthSeconds <= 0 {
			raw.LengthSeconds = 1800
		}
		ch := strings.TrimSpace(raw.Channel)
		if ch == "" {
			ch = film.Channel
		}
		normCandCh := ViNorm(ch)
		candKey, _, _, candPart := ExtractSeriesInfo(raw.Title, ch)
		normCandTitle := ViNorm(raw.Title)

		sameChannel := normFilmCh == "" || normCandCh == "" || normCandCh == normFilmCh ||
			strings.Contains(normCandCh, normFilmCh) || strings.Contains(normFilmCh, normCandCh)
		titleMatchesBase := normCandTitle != "" && strings.Contains(normCandTitle, normBase)
		sameSeries := candKey == seriesKey || (sameChannel && titleMatchesBase && (candPart || rePartRange.MatchString(raw.Title)))
		if !sameSeries {
			continue
		}
		// Ensure channel matches original movie channel when merging into the same series group
		if sameChannel {
			raw.Channel = film.Channel
		}
		classified, ok := classifyCrawledVideo(raw, film.Cat, true)
		if !ok {
			continue
		}
		classified.Channel = film.Channel
		classified.Cat = film.Cat
		newFilms = append(newFilms, classified)
	}

	added, _ := c.AddCrawledFilms(newFilms)
	return added, c.GetSeries(filmID)
}

// RunCrawlCycle executes one discovery batch across curated AI film/short-drama searches and known channels.
func (c *Catalog) RunCrawlCycle(ctx context.Context, kvt *kvtube.Service, maxQueries int) (int, []models.Film) {
	if kvt == nil {
		return 0, nil
	}

	c.mu.Lock()
	if c.CrawlRunning {
		c.mu.Unlock()
		return 0, nil
	}
	c.CrawlRunning = true
	cycle := c.CrawlCycleCount
	c.CrawlCycleCount++

	// Snapshot rotating channel IDs so we don't hold lock during network calls
	type chTarget struct {
		Name     string
		AuthorID string
	}
	var channelTargets []chTarget
	for name, aid := range c.ChannelIDs {
		if strings.HasPrefix(aid, "UC") {
			channelTargets = append(channelTargets, chTarget{Name: name, AuthorID: aid})
		}
	}
	sort.Slice(channelTargets, func(i, j int) bool {
		return channelTargets[i].Name < channelTargets[j].Name
	})
	c.mu.Unlock()

	defer func() {
		c.mu.Lock()
		c.CrawlRunning = false
		c.LastCrawlAt = time.Now()
		c.mu.Unlock()
	}()

	if maxQueries <= 0 {
		maxQueries = 4
	}

	var candidates []models.Film
	seenCand := make(map[string]bool)
	var errMsgs []string

	// 1. Search queries for latest released AI videos & short dramas
	nQueries := len(aiDiscoveryQueries)
	for i := 0; i < maxQueries && i < nQueries; i++ {
		if ctx.Err() != nil {
			break
		}
		qCfg := aiDiscoveryQueries[(cycle*maxQueries+i)%nQueries]
		qCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		rawItems, err := kvt.SearchLatestVideos(qCtx, qCfg.Query, qCfg.SortByDate)
		cancel()
		if err != nil {
			errMsgs = append(errMsgs, err.Error())
			continue
		}
		for _, raw := range rawItems {
			if seenCand[raw.VideoID] {
				continue
			}
			film, ok := classifyCrawledVideo(raw, qCfg.DefaultCat, false)
			if !ok {
				continue
			}
			seenCand[raw.VideoID] = true
			candidates = append(candidates, film)
		}
	}

	// 2. Check a rotating slice of known AI film channels for newly uploaded releases
	chCount := len(channelTargets)
	if chCount > 0 {
		chBatch := 4
		if chCount < chBatch {
			chBatch = chCount
		}
		for i := 0; i < chBatch; i++ {
			if ctx.Err() != nil {
				break
			}
			t := channelTargets[(cycle*chBatch+i)%chCount]
			chCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
			rawItems, err := kvt.FetchChannelLatestVideos(chCtx, t.AuthorID, t.Name)
			cancel()
			if err != nil {
				continue
			}
			for _, raw := range rawItems {
				if seenCand[raw.VideoID] {
					continue
				}
				film, ok := classifyCrawledVideo(raw, "dai", true)
				if !ok {
					continue
				}
				seenCand[raw.VideoID] = true
				candidates = append(candidates, film)
			}
		}
	}

	c.mu.Lock()
	if len(errMsgs) > 0 && len(candidates) == 0 {
		c.LastCrawlError = errMsgs[0]
	} else {
		c.LastCrawlError = ""
	}
	c.mu.Unlock()

	addedCount, addedFilms := c.AddCrawledFilms(candidates)

	// 3. Expand sibling episodes ("Tập 1, Tập 2, Tập 3...") for newly discovered episodic series
	expandedSeries := 0
	seenSeries := make(map[string]bool)
	for _, f := range addedFilms {
		if ctx.Err() != nil || expandedSeries >= 2 {
			break
		}
		sKey, _, _, hasPart := ExtractSeriesInfo(f.Title, f.Channel)
		if !hasPart || sKey == "" || seenSeries[sKey] {
			continue
		}
		seenSeries[sKey] = true
		expandedSeries++
		epCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
		epAdded, _ := c.DiscoverSeriesEpisodes(epCtx, kvt, f.ID, false)
		cancel()
		addedCount += epAdded
	}

	return addedCount, addedFilms
}

// StartAutoCrawler starts the periodic background discovery loop for latest AI videos and short dramas.
func (c *Catalog) StartAutoCrawler(ctx context.Context, kvt *kvtube.Service, interval time.Duration) {
	if interval <= 0 {
		interval = 30 * time.Minute
	}

	// Wait briefly after HTTP bind before running initial crawl cycle
	initTimer := time.NewTimer(5 * time.Second)
	select {
	case <-ctx.Done():
		initTimer.Stop()
		return
	case <-initTimer.C:
	}

	runCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	c.RunCrawlCycle(runCtx, kvt, 5)
	cancel()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			tickCtx, tickCancel := context.WithTimeout(ctx, 45*time.Second)
			c.RunCrawlCycle(tickCtx, kvt, 4)
			tickCancel()
		}
	}
}

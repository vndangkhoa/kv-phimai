package api

import "github.com/go-chi/chi/v5"

func RegisterRoutes(r chi.Router, h *Handler) {
	// Health & Manifest
	r.Get("/health", h.GetHealth)
	r.Get("/manifest", h.GetManifest)

	// Films Catalog, Search & Detail
	r.Get("/films", h.GetFilms)
	r.Get("/films/search", h.SearchFilms)
	r.Get("/films/{id}", h.GetFilmDetail)
	r.Get("/channels", h.GetChannels)
	r.Get("/channel/{id}", h.GetChannelDetail)
	r.Get("/channel/*", h.GetChannelDetail)

	// Native Invidious / Companion Same-Origin Proxy Architecture + Video Stream Engine
	r.HandleFunc("/invidious", h.ProxyInvidious)
	r.HandleFunc("/invidious/*", h.ProxyInvidious)
	r.Get("/video/{id}", h.GetKVTubeVideo)
	r.Get("/stream/{id}", h.StreamKVTubeVideo)
	r.Head("/stream/{id}", h.StreamKVTubeVideo)
	r.Get("/thumb/{id}", h.GetKVTubeThumb)
	r.Head("/thumb/{id}", h.GetKVTubeThumb)

	// Backward-compatible stream & thumbnail aliases
	r.Get("/kvtube/video/{id}", h.GetKVTubeVideo)
	r.Get("/kvtube/stream/{id}", h.StreamKVTubeVideo)
	r.Head("/kvtube/stream/{id}", h.StreamKVTubeVideo)
	r.Get("/kvtube/thumb/{id}", h.GetKVTubeThumb)
	r.Head("/kvtube/thumb/{id}", h.GetKVTubeThumb)

	// Site Telemetry & Presence
	r.Get("/stats", h.GetStats)
	r.Post("/visit", h.PostVisit)
	r.Post("/sitebeat", h.PostSitebeat)
	r.Post("/view", h.PostView)
	r.Get("/presence", h.HandlePresence)
	r.Post("/presence", h.HandlePresence)

	// Charts, Ratings, Comments, Community Wall, Suggestions & Screening
	r.Get("/hot", h.GetHot)
	r.Get("/topweek", h.GetTopWeek)
	r.Get("/ratings", h.GetRatings)
	r.Post("/rate", h.PostRate)
	r.Get("/comment-counts", h.GetCommentCounts)
	r.Get("/comments", h.GetComments)
	r.Post("/comments", h.PostComment)
	r.Get("/wall", h.GetWall)
	r.Post("/wall", h.PostWall)
	r.Post("/wall-like", h.PostWallLike)
	r.Get("/suggest", h.GetSuggest)
	r.Post("/suggest", h.PostSuggest)
	r.Get("/screening", h.GetScreening)

	// Watch Party 12-Hour Rooms
	r.Post("/room-create", h.PostRoomCreate)
	r.Get("/room", h.GetRoom)
	r.Post("/room-state", h.PostRoomState)
	r.Post("/room-chat", h.PostRoomChat)

	// 6-Digit TV Pairing
	r.Get("/tv-pair", h.HandleTVPair)
	r.Post("/tv-pair", h.HandleTVPair)

	// Extra PhimAI Compatibility Endpoints
	r.Get("/vote", h.GetVote)
	r.Get("/next-scan", h.GetNextScan)
	r.Get("/dubreq", h.GetDubReq)
	r.Post("/dubreq", h.GetDubReq)
	r.Post("/contact", h.PostContact)
}

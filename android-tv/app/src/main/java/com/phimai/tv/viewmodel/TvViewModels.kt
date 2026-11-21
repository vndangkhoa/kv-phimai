package com.phimai.tv.viewmodel

import android.app.Application
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.phimai.tv.BuildConfig
import com.phimai.tv.data.api.TvPhimAiApi
import com.phimai.tv.data.local.TvPrefsStore
import com.phimai.tv.data.model.TvChannelDetailResponse
import com.phimai.tv.data.model.TvChannelInfo
import com.phimai.tv.data.model.TvFilm
import com.phimai.tv.data.model.TvHealthResponse
import com.phimai.tv.data.model.TvHistoryEntry
import com.phimai.tv.data.model.TvQualityOption
import com.phimai.tv.data.model.TvRatingStat
import com.phimai.tv.data.model.TvTopWeekEntry
import com.phimai.tv.data.model.TvUpdateInfo
import com.phimai.tv.data.model.TvVideoStreamPayload
import com.phimai.tv.data.util.TvPhimAiUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream

data class TvHomeUiState(
    val isLoading: Boolean = true,
    val selectedCat: String = "all",
    val hero: List<TvFilm> = emptyList(),
    val rows: List<Pair<String, List<TvFilm>>> = emptyList(),
    val filtered: List<TvFilm> = emptyList(),
    val error: String? = null
)

class HomeViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = TvPrefsStore.getInstance(app)
    private val _state = MutableStateFlow(TvHomeUiState())
    val state: StateFlow<TvHomeUiState> = _state.asStateFlow()

    val serverUrl = TvPhimAiApi.serverFlow
    val continueWatching = prefs.historyFlow.map { list ->
        list.filter { it.positionMs > 5_000L }.map { it.film }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    val progressMap = prefs.historyFlow.map { list ->
        list.mapNotNull { h ->
            if (h.durationMs > 0L && h.positionMs > 5_000L) {
                val p = (h.positionMs.toFloat() / h.durationMs.toFloat()).coerceIn(0f, 1f)
                if (p in 0.03f..0.97f) h.film.id to p else null
            } else null
        }.toMap()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyMap())

    init {
        viewModelScope.launch {
            val savedServer = prefs.getServerUrl()
            TvPhimAiApi.setServerUrl(savedServer)
            refresh()
        }
    }

    fun refresh() {
        _state.value = _state.value.copy(isLoading = true, error = null)
        viewModelScope.launch {
            runCatching {
                coroutineScope {
                    val hotDef = async { TvPhimAiApi.getFilms(sort = "hot", limit = 24).items }
                    val newDef = async { TvPhimAiApi.getFilms(sort = "new", limit = 24).items }
                    val fullDef = async { TvPhimAiApi.getFilms(sort = "new", fullOnly = true, limit = 24).items }
                    val trungDef = async { TvPhimAiApi.getFilms(sort = "new", cat = "trung", limit = 24).items }
                    val hhDef = async { TvPhimAiApi.getFilms(sort = "new", cat = "hoathinh", limit = 24).items }
                    val fanDef = async { TvPhimAiApi.getFilms(sort = "new", cat = "fantasy", limit = 24).items }
                    val vnDef = async { TvPhimAiApi.getFilms(sort = "new", cat = "vietnam", limit = 24).items }

                    val hot = TvPhimAiUtils.stackSeriesForGrid(hotDef.await())
                    val newest = TvPhimAiUtils.stackSeriesForGrid(newDef.await())
                    val full = TvPhimAiUtils.stackSeriesForGrid(fullDef.await())
                    val trung = TvPhimAiUtils.stackSeriesForGrid(trungDef.await())
                    val hh = TvPhimAiUtils.stackSeriesForGrid(hhDef.await())
                    val fan = TvPhimAiUtils.stackSeriesForGrid(fanDef.await())
                    val vn = TvPhimAiUtils.stackSeriesForGrid(vnDef.await())

                    val rows = buildList {
                        if (newest.isNotEmpty()) add("Mới cập nhật" to newest)
                        if (hot.isNotEmpty()) add("Đang thịnh hành" to hot)
                        if (full.isNotEmpty()) add("Phim dài trọn bộ FULL" to full)
                        if (trung.isNotEmpty()) add("Tu tiên & Cổ trang" to trung)
                        if (hh.isNotEmpty()) add("Hoạt hình 3D" to hh)
                        if (fan.isNotEmpty()) add("Fantasy & Thần thoại" to fan)
                        if (vn.isNotEmpty()) add("Sử Việt & Phim Việt" to vn)
                    }
                    hot.take(6) to rows
                }
            }.onSuccess { (hero, rows) ->
                _state.value = _state.value.copy(isLoading = false, hero = hero, rows = rows, error = null)
            }.onFailure { err ->
                _state.value = _state.value.copy(isLoading = false, error = err.message ?: "Lỗi kết nối máy chủ")
            }
        }
    }

    fun selectCategory(cat: String) {
        _state.value = _state.value.copy(selectedCat = cat)
        if (cat == "all") {
            _state.value = _state.value.copy(filtered = emptyList())
            return
        }
        _state.value = _state.value.copy(isLoading = true, filtered = emptyList(), error = null)
        viewModelScope.launch {
            runCatching {
                val res = if (cat == "full") {
                    TvPhimAiApi.getFilms(sort = "new", fullOnly = true, limit = 48)
                } else {
                    TvPhimAiApi.getFilms(sort = "new", cat = cat, limit = 48)
                }
                TvPhimAiUtils.stackSeriesForGrid(res.items)
            }.onSuccess { list ->
                _state.value = _state.value.copy(isLoading = false, filtered = list)
            }.onFailure { err ->
                _state.value = _state.value.copy(isLoading = false, error = err.message ?: "Lỗi tải danh mục")
            }
        }
    }
}

data class TvDetailUiState(
    val isLoading: Boolean = true,
    val film: TvFilm? = null,
    val episodes: List<TvFilm> = emptyList(),
    val related: List<TvFilm> = emptyList(),
    val rating: TvRatingStat = TvRatingStat(),
    val isSaved: Boolean = false,
    val savedPositionMs: Long = 0L,
    val isDiscoveringEpisodes: Boolean = false,
    val error: String? = null
)

class DetailViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = TvPrefsStore.getInstance(app)
    private val _state = MutableStateFlow(TvDetailUiState())
    val state: StateFlow<TvDetailUiState> = _state.asStateFlow()

    fun load(filmId: String) {
        _state.value = TvDetailUiState(isLoading = true)
        viewModelScope.launch {
            TvPhimAiApi.prefetchVideo(filmId)
            runCatching {
                val detail = TvPhimAiApi.getFilmDetail(filmId)
                val savedPos = prefs.getSavedPositionMs(filmId)
                val savedList = prefs.savedFlow.first()
                val isSaved = savedList.any { it.id == filmId }
                val eps = TvPhimAiUtils.dedupeAndContiguousEpisodes(
                    detail.episodes.ifEmpty { detail.series },
                    filmId
                )
                TvDetailUiState(
                    isLoading = false,
                    film = detail.toFilm(),
                    episodes = eps,
                    related = detail.related,
                    rating = detail.rating,
                    isSaved = isSaved,
                    savedPositionMs = savedPos
                )
            }.onSuccess { _state.value = it }
                .onFailure { _state.value = TvDetailUiState(isLoading = false, error = it.message ?: "Không tải được phim") }
        }
    }

    fun toggleSave() {
        val film = _state.value.film ?: return
        viewModelScope.launch {
            val saved = prefs.toggleSave(film)
            _state.value = _state.value.copy(isSaved = saved)
        }
    }

    fun discoverEpisodes() {
        val film = _state.value.film ?: return
        if (_state.value.isDiscoveringEpisodes) return
        _state.value = _state.value.copy(isDiscoveringEpisodes = true)
        viewModelScope.launch {
            runCatching { TvPhimAiApi.discoverEpisodes(film.id) }
                .onSuccess { eps ->
                    val merged = TvPhimAiUtils.dedupeAndContiguousEpisodes(eps, film.id)
                    _state.value = _state.value.copy(
                        episodes = if (merged.isNotEmpty()) merged else _state.value.episodes,
                        isDiscoveringEpisodes = false
                    )
                }
                .onFailure { _state.value = _state.value.copy(isDiscoveringEpisodes = false) }
        }
    }
}

data class TvPlayerUiState(
    val isLoading: Boolean = true,
    val film: TvFilm? = null,
    val payload: TvVideoStreamPayload? = null,
    val qualityOptions: List<TvQualityOption> = emptyList(),
    val episodes: List<TvFilm> = emptyList(),
    val related: List<TvFilm> = emptyList(),
    val unavailableReason: String? = null,
    val error: String? = null
)

class PlayerViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = TvPrefsStore.getInstance(app)
    private val _state = MutableStateFlow(TvPlayerUiState())
    val state: StateFlow<TvPlayerUiState> = _state.asStateFlow()

    val autoPlayNext = prefs.autoPlayNextFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    suspend fun getResumePositionMs(filmId: String): Long = prefs.getSavedPositionMs(filmId)

    suspend fun getDefaultQualityCap(): Int = prefs.qualityCapFlow.first()

    fun dashManifestUrl(filmId: String): String = TvPhimAiUtils.dashManifestUrl(TvPhimAiApi.baseUrl, filmId)

    fun load(filmId: String) {
        _state.value = TvPlayerUiState(isLoading = true)
        viewModelScope.launch {
            coroutineScope {
                val detailDef = async { runCatching { TvPhimAiApi.getFilmDetail(filmId) }.getOrNull() }
                val streamDef = async { runCatching { TvPhimAiApi.getVideoStream(filmId) }.getOrNull() }
                val detail = detailDef.await()
                val stream = streamDef.await()

                val film = detail?.toFilm() ?: stream?.film ?: TvFilm(
                    id = filmId,
                    title = stream?.title?.ifBlank { "Phim AI #$filmId" } ?: "Phim AI #$filmId",
                    channel = stream?.author.orEmpty(),
                    thumbnailUrl = TvPhimAiUtils.thumbUrl(TvPhimAiApi.baseUrl, filmId)
                )
                val eps = TvPhimAiUtils.dedupeAndContiguousEpisodes(
                    detail?.episodes?.ifEmpty { detail.series }?.ifEmpty { stream?.series.orEmpty() }
                        ?: stream?.series.orEmpty(),
                    filmId
                )
                val related = detail?.related?.ifEmpty { stream?.related.orEmpty() } ?: stream?.related.orEmpty()
                val options = TvPhimAiUtils.buildQualityList(stream, TvPhimAiApi.baseUrl)
                val unavailable = if (stream?.unavailable == true) {
                    stream.unavailableReason.ifBlank { "Máy chủ chưa cấu hình nguồn phát (KVTUBE_URL)" }
                } else null

                prefs.recordWatchStart(film)
                TvPhimAiApi.recordView(filmId)

                val epIdx = eps.indexOfFirst { it.id == filmId }
                if (epIdx >= 0 && epIdx + 1 < eps.size) {
                    TvPhimAiApi.prefetchVideo(eps[epIdx + 1].id)
                } else if (related.isNotEmpty()) {
                    TvPhimAiApi.prefetchVideo(related.first().id)
                }

                _state.value = TvPlayerUiState(
                    isLoading = false,
                    film = film,
                    payload = stream,
                    qualityOptions = options,
                    episodes = eps,
                    related = related,
                    unavailableReason = unavailable
                )
            }
        }
    }

    fun updateProgress(filmId: String, posMs: Long, durMs: Long) {
        viewModelScope.launch { prefs.updateProgress(filmId, posMs, durMs) }
    }

    fun nextUpFilmId(currentId: String): String? {
        val eps = _state.value.episodes
        val idx = eps.indexOfFirst { it.id == currentId }
        if (idx >= 0 && idx + 1 < eps.size) return eps[idx + 1].id
        return _state.value.related.firstOrNull()?.id
    }
}

class TrendingViewModel(app: Application) : AndroidViewModel(app) {
    private val _topWeek = MutableStateFlow<List<TvTopWeekEntry>>(emptyList())
    val topWeek: StateFlow<List<TvTopWeekEntry>> = _topWeek.asStateFlow()

    private val _hot = MutableStateFlow<List<TvFilm>>(emptyList())
    val hot: StateFlow<List<TvFilm>> = _hot.asStateFlow()

    private val _mostViewed = MutableStateFlow<List<TvFilm>>(emptyList())
    val mostViewed: StateFlow<List<TvFilm>> = _mostViewed.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    init { refresh() }

    fun refresh() {
        _loading.value = true
        viewModelScope.launch {
            runCatching {
                val t = runCatching { TvPhimAiApi.getTopWeek() }.getOrDefault(emptyList())
                val h = TvPhimAiUtils.stackSeriesForGrid(TvPhimAiApi.getFilms(sort = "hot", limit = 30).items)
                val v = TvPhimAiUtils.stackSeriesForGrid(TvPhimAiApi.getFilms(sort = "views", limit = 30).items)
                Triple(t, h, v)
            }.onSuccess { (t, h, v) ->
                _topWeek.value = t
                _hot.value = h
                _mostViewed.value = v
                _loading.value = false
            }.onFailure { _loading.value = false }
        }
    }
}

class ChannelsViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = TvPrefsStore.getInstance(app)
    private val _channels = MutableStateFlow<List<TvChannelInfo>>(emptyList())
    val channels: StateFlow<List<TvChannelInfo>> = _channels.asStateFlow()

    private val _channelDetail = MutableStateFlow<TvChannelDetailResponse?>(null)
    val channelDetail: StateFlow<TvChannelDetailResponse?> = _channelDetail.asStateFlow()

    private val _loading = MutableStateFlow(true)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    val subscribed = prefs.subscribedChannelsFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    init { loadDirectory() }

    fun loadDirectory() {
        _loading.value = true
        viewModelScope.launch {
            runCatching { TvPhimAiApi.getChannels(sort = "popular") }
                .onSuccess { _channels.value = it; _loading.value = false }
                .onFailure { _loading.value = false }
        }
    }

    fun loadChannel(name: String) {
        _loading.value = true
        viewModelScope.launch {
            runCatching { TvPhimAiApi.getChannelDetail(name) }
                .onSuccess { _channelDetail.value = it; _loading.value = false }
                .onFailure { _loading.value = false }
        }
    }

    fun toggleSubscribe(name: String) {
        viewModelScope.launch { prefs.toggleSubscription(name) }
    }
}

class SearchViewModel(app: Application) : AndroidViewModel(app) {
    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _results = MutableStateFlow<List<TvFilm>>(emptyList())
    val results: StateFlow<List<TvFilm>> = _results.asStateFlow()

    private val _loading = MutableStateFlow(false)
    val loading: StateFlow<Boolean> = _loading.asStateFlow()

    fun setQuery(q: String) {
        _query.value = q
    }

    fun executeSearch(raw: String = _query.value) {
        val q = raw.trim()
        if (q.isEmpty()) return
        _query.value = q
        _loading.value = true
        viewModelScope.launch {
            runCatching { TvPhimAiUtils.stackSeriesForGrid(TvPhimAiApi.searchFilms(q).items) }
                .onSuccess { _results.value = it; _loading.value = false }
                .onFailure { _loading.value = false }
        }
    }
}

class LibraryViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = TvPrefsStore.getInstance(app)
    val history: StateFlow<List<TvHistoryEntry>> =
        prefs.historyFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val saved: StateFlow<List<TvFilm>> =
        prefs.savedFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
    val subs: StateFlow<List<String>> =
        prefs.subscribedChannelsFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())
}

class SettingsViewModel(app: Application) : AndroidViewModel(app) {
    private val prefs = TvPrefsStore.getInstance(app)
    val serverUrl = prefs.serverUrlFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TvPhimAiUtils.DEFAULT_SERVER_URL)
    val qualityCap = prefs.qualityCapFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
    val autoPlayNext = prefs.autoPlayNextFlow.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    private val _health = MutableStateFlow<TvHealthResponse?>(null)
    val health: StateFlow<TvHealthResponse?> = _health.asStateFlow()

    private val _healthError = MutableStateFlow<String?>(null)
    val healthError: StateFlow<String?> = _healthError.asStateFlow()

    private val _updateStatus = MutableStateFlow<String?>(null)
    val updateStatus: StateFlow<String?> = _updateStatus.asStateFlow()

    private val _availableUpdate = MutableStateFlow<TvUpdateInfo?>(null)
    val availableUpdate: StateFlow<TvUpdateInfo?> = _availableUpdate.asStateFlow()

    init { checkHealth() }

    fun saveServerUrl(url: String) {
        viewModelScope.launch {
            prefs.setServerUrl(url)
            TvPhimAiApi.setServerUrl(url)
            checkHealth(url)
        }
    }

    fun checkHealth(overrideUrl: String? = null) {
        _healthError.value = null
        viewModelScope.launch {
            runCatching { TvPhimAiApi.getHealth(overrideUrl) }
                .onSuccess { _health.value = it }
                .onFailure { _healthError.value = it.message ?: "Không kết nối được máy chủ" }
        }
    }

    fun setQualityCap(cap: Int) {
        viewModelScope.launch { prefs.setQualityCap(cap) }
    }

    fun setAutoPlayNext(enabled: Boolean) {
        viewModelScope.launch { prefs.setAutoPlayNext(enabled) }
    }

    fun clearHistory() {
        viewModelScope.launch { prefs.clearHistory() }
    }

    fun checkUpdate() {
        _updateStatus.value = "Đang kiểm tra phiên bản..."
        viewModelScope.launch {
            val info = withContext(Dispatchers.IO) {
                runCatching {
                    val req = Request.Builder()
                        .url("https://api.github.com/repos/vndangkhoa/kv-phimai/releases?per_page=20")
                        .header("Accept", "application/vnd.github.v3+json")
                        .build()
                    TvPhimAiApi.okHttp.newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) return@use null
                        val arr = TvPhimAiApi.json.parseToJsonElement(resp.body?.string() ?: "[]").jsonArray
                        for (el in arr) {
                            val obj = el.jsonObject
                            val tag = obj["tag_name"]?.jsonPrimitive?.content ?: ""
                            var tvApk = ""
                            obj["assets"]?.jsonArray?.forEach { a ->
                                val ao = a.jsonObject
                                val name = ao["name"]?.jsonPrimitive?.content ?: ""
                                if (name.endsWith(".apk", true) && name.contains("tv", true)) {
                                    tvApk = ao["browser_download_url"]?.jsonPrimitive?.content ?: ""
                                }
                            }
                            if (tvApk.isNotEmpty() && tag.removePrefix("v") != BuildConfig.VERSION_NAME) {
                                return@use TvUpdateInfo(tag.removePrefix("v"), tvApk, obj["body"]?.jsonPrimitive?.content ?: "")
                            }
                        }
                        null
                    }
                }.getOrNull()
            }
            _availableUpdate.value = info
            _updateStatus.value = if (info != null) {
                "Có bản TV mới ${info.latestVersion}"
            } else {
                "Bạn đang dùng phiên bản mới nhất (${BuildConfig.VERSION_NAME})"
            }
        }
    }

    fun downloadAndInstall(info: TvUpdateInfo) {
        _updateStatus.value = "Đang tải PhimAI TV v${info.latestVersion}..."
        viewModelScope.launch {
            val file = withContext(Dispatchers.IO) {
                runCatching {
                    val req = Request.Builder().url(info.downloadUrl).build()
                    TvPhimAiApi.okHttp.newCall(req).execute().use { resp ->
                        if (!resp.isSuccessful) return@use null
                        val body = resp.body ?: return@use null
                        val out = File(getApplication<Application>().cacheDir, "phimai-tv-update.apk")
                        body.byteStream().use { input ->
                            FileOutputStream(out).use { output -> input.copyTo(output) }
                        }
                        out
                    }
                }.getOrNull()
            }
            if (file != null) {
                val app = getApplication<Application>()
                val uri: Uri = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    FileProvider.getUriForFile(app, "${app.packageName}.fileprovider", file)
                } else Uri.fromFile(file)
                app.startActivity(
                    Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, "application/vnd.android.package-archive")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION
                    }
                )
            } else {
                _updateStatus.value = "Tải bản cập nhật thất bại"
            }
        }
    }
}

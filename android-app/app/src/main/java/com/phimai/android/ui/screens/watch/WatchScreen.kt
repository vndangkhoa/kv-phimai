package com.phimai.android.ui.screens.watch

import android.app.PictureInPictureParams
import android.content.Intent
import android.content.pm.ActivityInfo
import android.os.Build
import android.util.Rational
import android.view.WindowManager
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsTopHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridScope
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.itemsIndexed as gridItemsIndexed
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.StarBorder
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material.icons.outlined.BookmarkBorder
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.min
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavController
import com.phimai.android.MainActivity
import com.phimai.android.data.model.CommentItem
import com.phimai.android.data.model.Film
import com.phimai.android.data.util.PhimAiUtils
import com.phimai.android.ui.adaptive.LocalWindowState
import com.phimai.android.ui.adaptive.findActivity
import com.phimai.android.ui.components.ChannelInitialAvatar
import com.phimai.android.ui.components.FilmCard
import com.phimai.android.ui.navigation.Screen
import com.phimai.android.ui.theme.CinemaRadius
import com.phimai.android.ui.theme.cinema
import kotlinx.coroutines.delay

@Composable
fun WatchScreen(
    filmId: String,
    navController: NavController,
    viewModel: WatchViewModel = hiltViewModel()
) {
    val palette = cinema
    val uiState by viewModel.uiState.collectAsState()
    val savedIds by viewModel.savedIds.collectAsState()
    val autoPlayNext by viewModel.autoPlayNext.collectAsState()
    val activeHeight by viewModel.playbackManagerRef.activeHeight.collectAsState()

    val context = LocalContext.current
    val activity = context.findActivity()
    val windowState = LocalWindowState.current

    var isFullscreen by remember { mutableStateOf(false) }
    var isTheater by rememberSaveable { mutableStateOf(false) }
    var dismissedTabletop by rememberSaveable { mutableStateOf(false) }
    var relatedFilter by rememberSaveable { mutableStateOf("all") }

    LaunchedEffect(filmId) {
        viewModel.load(filmId)
    }

    // Periodically persist watch position
    LaunchedEffect(filmId) {
        while (true) {
            delay(5_000)
            val p = viewModel.playbackManagerRef.player
            val pos = p.currentPosition.coerceAtLeast(0L)
            val dur = p.duration.coerceAtLeast(0L)
            if (pos > 0L) viewModel.saveProgress(pos, dur)
        }
    }

    LaunchedEffect(windowState.isTabletop) {
        if (windowState.isTabletop) dismissedTabletop = false
    }

    val canToggleTheater = windowState.isLandscapeTwoPaneWatch && !windowState.isTabletop
    val theaterMode = isTheater && canToggleTheater

    DisposableEffect(activity) {
        val window = activity?.window
        if (window != null) {
            val controller = WindowCompat.getInsetsController(window, window.decorView)
            val prevLight = controller.isAppearanceLightStatusBars
            @Suppress("DEPRECATION")
            val prevColor = window.statusBarColor
            controller.isAppearanceLightStatusBars = false
            @Suppress("DEPRECATION")
            window.statusBarColor = android.graphics.Color.BLACK
            onDispose {
                controller.isAppearanceLightStatusBars = prevLight
                @Suppress("DEPRECATION")
                window.statusBarColor = prevColor
            }
        } else onDispose {}
    }

    LaunchedEffect(isFullscreen) {
        val window = activity?.window ?: return@LaunchedEffect
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        if (isFullscreen) {
            controller.hide(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                window.attributes.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
        } else {
            controller.show(WindowInsetsCompat.Type.systemBars())
            activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
        viewModel.setPlayerFullscreen(isFullscreen)
    }

    DisposableEffect(Unit) {
        onDispose {
            val p = viewModel.playbackManagerRef.player
            val pos = p.currentPosition.coerceAtLeast(0L)
            val dur = p.duration.coerceAtLeast(0L)
            if (pos > 0L) viewModel.saveProgress(pos, dur)
            viewModel.setPlayerFullscreen(false)
            activity?.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        }
    }

    BackHandler(enabled = isFullscreen) {
        isFullscreen = false
    }

    val pipAction: (() -> Unit)? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        {
            activity?.let { act ->
                (act as? MainActivity)?.setPipVideo(
                    videoUrl = uiState.selectedUrl.orEmpty(),
                    audioUrl = uiState.audioUrl
                )
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(16, 9))
                    .build()
                act.enterPictureInPictureMode(params)
            }
        }
    } else null

    val onFilmEnded: () -> Unit = {
        if (autoPlayNext) {
            viewModel.nextAutoPlayFilmId()?.let { nextId ->
                navController.navigate(Screen.Watch.createRoute(nextId)) {
                    popUpTo(Screen.Watch.route) { inclusive = true }
                }
            }
        }
    }

    if (isFullscreen) {
        Box(modifier = Modifier.fillMaxSize()) {
            ExoPlayerView(
                videoUrl = uiState.selectedUrl.orEmpty(),
                audioUrl = uiState.audioUrl,
                sharedPlayer = viewModel.playbackManagerRef.player,
                title = uiState.film?.title.orEmpty(),
                activeHeight = activeHeight,
                selectedTier = uiState.selectedTier,
                isFullscreen = true,
                onTierSelected = { viewModel.selectQualityTier(it) },
                onFullscreenToggle = { isFullscreen = false },
                onEnterPip = pipAction,
                onBackClick = { isFullscreen = false },
                onEndedNext = onFilmEnded,
                onError = { viewModel.handlePlaybackError() },
                modifier = Modifier.fillMaxSize()
            )
        }
        return
    }

    val playerContent: @Composable (Modifier, Boolean, Boolean) -> Unit = { playerMod, fillAvail, hideOverlay ->
        if (uiState.backendUnavailableReason != null) {
            Box(
                modifier = if (fillAvail) playerMod.background(palette.slate)
                else playerMod.height(220.dp).background(palette.slate),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = uiState.backendUnavailableReason ?: "",
                        color = palette.crimsonSoft,
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = { viewModel.retry() },
                        colors = ButtonDefaults.buttonColors(containerColor = palette.gold, contentColor = palette.obsidian)
                    ) { Text("Thử lại", fontWeight = FontWeight.Bold) }
                }
            }
        } else {
            ExoPlayerView(
                videoUrl = uiState.selectedUrl.orEmpty(),
                audioUrl = uiState.audioUrl,
                sharedPlayer = viewModel.playbackManagerRef.player,
                title = uiState.film?.title.orEmpty(),
                activeHeight = activeHeight,
                selectedTier = uiState.selectedTier,
                isFullscreen = false,
                onTierSelected = { viewModel.selectQualityTier(it) },
                onFullscreenToggle = { isFullscreen = true },
                onEnterPip = pipAction,
                onTheaterToggle = if (canToggleTheater) {
                    { isTheater = !isTheater }
                } else null,
                isTheater = theaterMode,
                cornerRadius = 0.dp,
                fillAvailableSpace = fillAvail,
                hideOverlayControls = hideOverlay,
                onBackClick = { navController.popBackStack() },
                onEndedNext = onFilmEnded,
                onError = { viewModel.handlePlaybackError() },
                modifier = playerMod
            )
        }
    }

    val filteredRelated = remember(uiState.relatedFilms, relatedFilter, uiState.film) {
        val current = uiState.film
        when (relatedFilter) {
            "cat" -> uiState.relatedFilms.filter { current == null || it.cat == current.cat }
            "channel" -> uiState.relatedFilms.filter { current == null || it.channel.equals(current.channel, ignoreCase = true) }
            "full" -> uiState.relatedFilms.filter { "full" in it.dur.lowercase() || "trọn" in it.dur.lowercase() }
            else -> uiState.relatedFilms
        }.ifEmpty { uiState.relatedFilms }
    }

    val detailsBlock: @Composable () -> Unit = {
        val film = uiState.film
        if (film != null) {
            FilmDetailsSection(
                film = film,
                episodes = uiState.episodes,
                isSaved = film.id in savedIds,
                isSubscribed = uiState.isSubscribed,
                rating = uiState.rating,
                myRating = uiState.myRatingStars,
                isDiscovering = uiState.isDiscoveringEpisodes,
                onSelectEpisode = { epId ->
                    navController.navigate(Screen.Watch.createRoute(epId)) {
                        popUpTo(Screen.Watch.route) { inclusive = true }
                    }
                },
                onDiscoverEpisodes = { viewModel.discoverMoreEpisodes() },
                onToggleSave = { viewModel.toggleSave() },
                onToggleSubscribe = { viewModel.toggleSubscription() },
                onRate = { stars -> viewModel.rate(stars) },
                onShare = {
                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                        type = "text/plain"
                        putExtra(Intent.EXTRA_SUBJECT, film.title)
                        putExtra(Intent.EXTRA_TEXT, "${uiState.serverBaseUrl}/watch?v=${film.id}")
                    }
                    context.startActivity(Intent.createChooser(shareIntent, "Chia sẻ phim"))
                },
                onChannelClick = { ch ->
                    if (ch.isNotBlank()) navController.navigate(Screen.ChannelDetail.createRoute(ch))
                }
            )
        }
    }

    var commentDraft by remember { mutableStateOf("") }
    var commentName by remember { mutableStateOf("") }
    var attachTimestamp by remember { mutableStateOf(false) }

    val commentsHeaderBlock: @Composable () -> Unit = {
        CommentsComposerSection(
            count = uiState.comments.size,
            draftText = commentDraft,
            authorName = commentName,
            attachTimestamp = attachTimestamp,
            isPosting = uiState.isPostingComment,
            onDraftChange = { commentDraft = it },
            onNameChange = { commentName = it },
            onToggleTimestamp = { attachTimestamp = !attachTimestamp },
            onSubmit = {
                val stampSec = if (attachTimestamp) (viewModel.playbackManagerRef.player.currentPosition / 1000L).toInt() else 0
                viewModel.postComment(commentName, commentDraft, stampSec)
                commentDraft = ""
            }
        )
    }

    val infoListItems: LazyListScope.() -> Unit = {
        item { detailsBlock() }
        item { commentsHeaderBlock() }
        itemsIndexed(uiState.comments, key = { idx, c -> "c_${idx}_${c.id}_${c.ts}" }) { _, comment ->
            CommentRow(
                comment = comment,
                onSeekStamp = { sec -> viewModel.playbackManagerRef.player.seekTo(sec * 1000L) }
            )
        }
    }

    val gridInfoItems: LazyGridScope.() -> Unit = {
        item(span = { GridItemSpan(maxLineSpan) }) { detailsBlock() }
        item(span = { GridItemSpan(maxLineSpan) }) { commentsHeaderBlock() }
        gridItemsIndexed(
            uiState.comments,
            key = { idx, c -> "gc_${idx}_${c.id}_${c.ts}" },
            span = { _, _ -> GridItemSpan(maxLineSpan) }
        ) { _, comment ->
            CommentRow(
                comment = comment,
                onSeekStamp = { sec -> viewModel.playbackManagerRef.player.seekTo(sec * 1000L) }
            )
        }
    }

    val relatedHeader: @Composable () -> Unit = {
        Column(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
            Text(
                text = "Phim đề xuất tiếp theo",
                color = palette.ivory,
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(Modifier.height(6.dp))
            Row(
                modifier = Modifier.horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf("all" to "Tất cả", "cat" to "Cùng mục", "channel" to "Cùng kênh", "full" to "Trọn bộ").forEach { (id, label) ->
                    val selected = relatedFilter == id
                    Surface(
                        shape = RoundedCornerShape(7.dp),
                        color = if (selected) palette.gold else palette.slateRaised,
                        border = BorderStroke(1.dp, if (selected) palette.gold else palette.border),
                        modifier = Modifier.clickable { relatedFilter = id }
                    ) {
                        Text(
                            text = label,
                            color = if (selected) palette.obsidian else palette.textSecondary,
                            fontSize = 11.5.sp,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(horizontal = 9.dp, vertical = 4.dp)
                        )
                    }
                }
            }
        }
    }

    val relatedListItems: LazyListScope.() -> Unit = {
        item { relatedHeader() }
        itemsIndexed(filteredRelated, key = { idx, f -> "rel_${f.id}_$idx" }) { _, rf ->
            FilmCard(
                film = rf,
                serverUrl = uiState.serverBaseUrl,
                isSaved = rf.id in savedIds,
                onFilmClick = { clicked ->
                    navController.navigate(Screen.Watch.createRoute(clicked.id)) {
                        popUpTo(Screen.Watch.route) { inclusive = true }
                    }
                },
                onToggleSave = { viewModel.toggleSaveFilm(it) },
                onChannelClick = { ch -> navController.navigate(Screen.ChannelDetail.createRoute(ch)) },
                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp)
            )
        }
    }

    when {
        windowState.isTabletop -> {
            // Foldable Half-Open Horizontal (Tabletop): unobstructed video top half, controls or list bottom half
            BoxWithConstraints(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black)
            ) {
                val topPaneHeight = if (windowState.hingeTopDp > 120f) windowState.hingeTopDp.dp else maxHeight * 0.5f
                Column(modifier = Modifier.fillMaxSize()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(topPaneHeight)
                            .background(Color.Black)
                            .statusBarsPaddingSafe()
                    ) {
                        playerContent(Modifier.fillMaxSize(), true, !dismissedTabletop)
                    }
                    if (windowState.hingeHeightDp > 0f) {
                        Spacer(Modifier.height(windowState.hingeHeightDp.dp))
                    }
                    Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        if (!dismissedTabletop) {
                            TabletopVideoControls(
                                player = viewModel.playbackManagerRef.player,
                                title = uiState.film?.title.orEmpty(),
                                channelName = uiState.film?.channel.orEmpty(),
                                hasNext = viewModel.nextAutoPlayFilmId() != null,
                                onPrevious = { navController.popBackStack() },
                                onNext = {
                                    viewModel.nextAutoPlayFilmId()?.let { nextId ->
                                        navController.navigate(Screen.Watch.createRoute(nextId)) {
                                            popUpTo(Screen.Watch.route) { inclusive = true }
                                        }
                                    }
                                },
                                onFullscreen = { isFullscreen = true },
                                onClose = { dismissedTabletop = true },
                                modifier = Modifier.fillMaxSize()
                            )
                        } else {
                            Column(
                                modifier = Modifier
                                    .fillMaxSize()
                                    .background(palette.obsidian)
                                    .navigationBarsPadding()
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 14.dp, vertical = 6.dp),
                                    horizontalArrangement = Arrangement.End
                                ) {
                                    Surface(
                                        shape = RoundedCornerShape(16.dp),
                                        color = palette.slateRaised,
                                        border = BorderStroke(1.dp, palette.border),
                                        modifier = Modifier.clickable { dismissedTabletop = false }
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                            verticalAlignment = Alignment.CenterVertically,
                                            horizontalArrangement = Arrangement.spacedBy(5.dp)
                                        ) {
                                            Icon(Icons.Filled.Tune, contentDescription = null, tint = palette.gold, modifier = Modifier.size(16.dp))
                                            Text("Bảng điều khiển", color = palette.ivory, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                        }
                                    }
                                }
                                LazyVerticalGrid(
                                    columns = GridCells.Fixed(2),
                                    modifier = Modifier.weight(1f).fillMaxWidth(),
                                    contentPadding = PaddingValues(bottom = 16.dp)
                                ) {
                                    gridInfoItems()
                                    item(span = { GridItemSpan(maxLineSpan) }) { relatedHeader() }
                                    gridItemsIndexed(filteredRelated, key = { idx, f -> "t_${f.id}_$idx" }) { idx, rf ->
                                        FilmCard(
                                            film = rf,
                                            serverUrl = uiState.serverBaseUrl,
                                            isSaved = rf.id in savedIds,
                                            onFilmClick = { clicked ->
                                                navController.navigate(Screen.Watch.createRoute(clicked.id)) {
                                                    popUpTo(Screen.Watch.route) { inclusive = true }
                                                }
                                            },
                                            onToggleSave = { viewModel.toggleSaveFilm(it) },
                                            onChannelClick = { ch -> navController.navigate(Screen.ChannelDetail.createRoute(ch)) },
                                            modifier = Modifier.padding(start = if (idx % 2 == 0) 12.dp else 6.dp, end = if (idx % 2 == 0) 6.dp else 12.dp, bottom = 12.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        windowState.isFoldablePortraitWatch -> {
            // Unfolded Foldable Portrait (Medium 600..839dp): player pinned top, 2-col related below
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(palette.obsidian)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.Black)
                        .windowInsetsTopHeight(WindowInsets.statusBars)
                )
                BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
                    val playerHeight = min(maxWidth * 9f / 16f, maxHeight * 0.56f)
                    Column(modifier = Modifier.fillMaxSize()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(playerHeight)
                                .background(Color.Black),
                            contentAlignment = Alignment.Center
                        ) {
                            playerContent(Modifier.fillMaxSize(), true, false)
                        }
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth()
                                .navigationBarsPadding(),
                            contentPadding = PaddingValues(bottom = 16.dp)
                        ) {
                            gridInfoItems()
                            item(span = { GridItemSpan(maxLineSpan) }) { relatedHeader() }
                            gridItemsIndexed(filteredRelated, key = { idx, f -> "fp_${f.id}_$idx" }) { idx, rf ->
                                FilmCard(
                                    film = rf,
                                    serverUrl = uiState.serverBaseUrl,
                                    isSaved = rf.id in savedIds,
                                    onFilmClick = { clicked ->
                                        navController.navigate(Screen.Watch.createRoute(clicked.id)) {
                                            popUpTo(Screen.Watch.route) { inclusive = true }
                                        }
                                    },
                                    onToggleSave = { viewModel.toggleSaveFilm(it) },
                                    onChannelClick = { ch -> navController.navigate(Screen.ChannelDetail.createRoute(ch)) },
                                    modifier = Modifier.padding(start = if (idx % 2 == 0) 12.dp else 6.dp, end = if (idx % 2 == 0) 6.dp else 12.dp, bottom = 12.dp)
                                )
                            }
                        }
                    }
                }
            }
        }

        windowState.isLandscapeTwoPaneWatch -> {
            // Tablet Landscape / Foldable Landscape / Book Hinge Posture
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(palette.obsidian)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.Black)
                        .windowInsetsTopHeight(WindowInsets.statusBars)
                )
                if (theaterMode) {
                    BoxWithConstraints(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        val playerHeight = min(maxWidth * 9f / 16f, maxHeight * 0.72f)
                        val playerWidth = playerHeight * 16f / 9f
                        Column(modifier = Modifier.fillMaxSize()) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(playerHeight)
                                    .background(Color.Black),
                                contentAlignment = Alignment.Center
                            ) {
                                playerContent(Modifier.width(playerWidth).fillMaxHeight(), true, false)
                            }
                            Row(
                                modifier = Modifier
                                    .weight(1f)
                                    .fillMaxWidth()
                                    .navigationBarsPadding()
                            ) {
                                LazyColumn(modifier = Modifier.weight(0.64f).fillMaxHeight()) { infoListItems() }
                                Surface(
                                    modifier = Modifier
                                        .weight(0.36f)
                                        .fillMaxHeight()
                                        .padding(start = 8.dp, end = 10.dp, top = 8.dp),
                                    shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                                    color = palette.slate
                                ) {
                                    LazyColumn(modifier = Modifier.fillMaxSize()) { relatedListItems() }
                                }
                            }
                        }
                    }
                } else {
                    val useHingeSplit = windowState.isBook && windowState.hingeStartDp > 200f
                    Row(
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth()
                            .navigationBarsPadding()
                    ) {
                        val leftMod = if (useHingeSplit) Modifier.width(windowState.hingeStartDp.dp) else Modifier.weight(0.64f)
                        BoxWithConstraints(modifier = leftMod.fillMaxHeight()) {
                            val playerHeight = min(maxWidth * 9f / 16f, maxHeight * 0.62f)
                            val playerWidth = playerHeight * 16f / 9f
                            Column(modifier = Modifier.fillMaxSize()) {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(playerHeight)
                                        .background(Color.Black),
                                    contentAlignment = Alignment.Center
                                ) {
                                    playerContent(Modifier.width(playerWidth).fillMaxHeight(), true, false)
                                }
                                LazyColumn(modifier = Modifier.weight(1f).fillMaxWidth()) { infoListItems() }
                            }
                        }
                        if (useHingeSplit && windowState.hingeWidthDp > 0f) {
                            Spacer(Modifier.width(windowState.hingeWidthDp.dp))
                        }
                        val rightMod = if (useHingeSplit) Modifier.weight(1f) else Modifier.weight(0.36f)
                        Surface(
                            modifier = rightMod
                                .fillMaxHeight()
                                .padding(start = 8.dp, end = 10.dp, top = 8.dp),
                            shape = RoundedCornerShape(topStart = 16.dp, topEnd = 16.dp),
                            color = palette.slate
                        ) {
                            LazyColumn(modifier = Modifier.fillMaxSize()) { relatedListItems() }
                        }
                    }
                }
            }
        }

        else -> {
            // Compact Phone (< 600dp)
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .background(palette.obsidian)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(Color.Black)
                        .windowInsetsTopHeight(WindowInsets.statusBars)
                )
                playerContent(Modifier.fillMaxWidth(), false, false)
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .fillMaxWidth()
                        .navigationBarsPadding()
                ) {
                    infoListItems()
                    relatedListItems()
                }
            }
        }
    }
}

@Composable
private fun Modifier.statusBarsPaddingSafe(): Modifier =
    this.padding(top = 0.dp)

@Composable
private fun FilmDetailsSection(
    film: Film,
    episodes: List<Film>,
    isSaved: Boolean,
    isSubscribed: Boolean,
    rating: com.phimai.android.data.model.RatingStat,
    myRating: Int,
    isDiscovering: Boolean,
    onSelectEpisode: (String) -> Unit,
    onDiscoverEpisodes: () -> Unit,
    onToggleSave: () -> Unit,
    onToggleSubscribe: () -> Unit,
    onRate: (Int) -> Unit,
    onShare: () -> Unit,
    onChannelClick: (String) -> Unit
) {
    val palette = cinema
    var expandDesc by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            if (film.rank > 0) {
                Surface(
                    shape = RoundedCornerShape(5.dp),
                    color = palette.goldMuted,
                    border = BorderStroke(1.dp, palette.gold.copy(alpha = 0.35f))
                ) {
                    Text(
                        text = "#${film.rank}",
                        color = palette.gold,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                    )
                }
            }
            Surface(shape = RoundedCornerShape(5.dp), color = palette.slateRaised) {
                Text(
                    text = film.tool.ifBlank { "AI" },
                    color = palette.textSecondary,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp)
                )
            }
        }

        Text(
            text = film.title,
            color = palette.ivory,
            fontSize = 17.sp,
            lineHeight = 23.sp,
            fontWeight = FontWeight.Bold
        )

        // Channel Strip
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .weight(1f)
                    .clickable { onChannelClick(film.channel) }
            ) {
                ChannelInitialAvatar(name = film.channel.ifBlank { "PhimAI" }, size = 38.dp)
                Spacer(Modifier.width(10.dp))
                Column(Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            text = film.channel.ifBlank { "PhimAI" },
                            color = palette.ivory,
                            fontSize = 14.sp,
                            fontWeight = FontWeight.SemiBold,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Icon(Icons.Filled.Verified, contentDescription = null, tint = palette.gold, modifier = Modifier.size(14.dp))
                    }
                    Text("Xem kho phim kênh", color = palette.textMuted, fontSize = 11.5.sp)
                }
            }
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (isSubscribed) palette.slateRaised else palette.gold,
                border = BorderStroke(1.dp, if (isSubscribed) palette.border else palette.gold),
                modifier = Modifier.clickable { onToggleSubscribe() }
            ) {
                Text(
                    text = if (isSubscribed) "Đã đăng ký" else "Đăng ký",
                    color = if (isSubscribed) palette.textSecondary else palette.obsidian,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                )
            }
        }

        // Actions Row: 5-Star Rating + Watch Later + Share
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = palette.slate,
                border = BorderStroke(1.dp, palette.border)
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(2.dp)
                ) {
                    (1..5).forEach { star ->
                        val active = if (myRating > 0) star <= myRating else star <= kotlin.math.round(rating.average).toInt()
                        Icon(
                            imageVector = if (active) Icons.Filled.Star else Icons.Filled.StarBorder,
                            contentDescription = "$star sao",
                            tint = if (active) palette.gold else palette.textMuted,
                            modifier = Modifier
                                .size(19.dp)
                                .clickable { onRate(star) }
                        )
                    }
                    Spacer(Modifier.width(4.dp))
                    val ratingLabel = if (rating.n > 0) "%.1f (%d)".format(rating.average, rating.n) else "Đánh giá"
                    Text(ratingLabel, color = palette.textSecondary, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                }
            }

            Surface(
                shape = RoundedCornerShape(8.dp),
                color = if (isSaved) palette.goldMuted else palette.slate,
                border = BorderStroke(1.dp, if (isSaved) palette.gold.copy(alpha = 0.45f) else palette.border),
                modifier = Modifier.clickable { onToggleSave() }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(
                        imageVector = if (isSaved) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                        contentDescription = null,
                        tint = if (isSaved) palette.gold else palette.ivory,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = if (isSaved) "Đã lưu" else "Xem sau",
                        color = if (isSaved) palette.gold else palette.ivory,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            Surface(
                shape = RoundedCornerShape(8.dp),
                color = palette.slate,
                border = BorderStroke(1.dp, palette.border),
                modifier = Modifier.clickable { onShare() }
            ) {
                Row(
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(5.dp)
                ) {
                    Icon(Icons.Filled.Share, contentDescription = null, tint = palette.ivory, modifier = Modifier.size(16.dp))
                    Text("Chia sẻ", color = palette.ivory, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                }
            }
        }

        // Episodes Strip + "Tìm thêm tập"
        if (episodes.size > 1 || PhimAiUtils.getEpisodeNumber(film.title) != null) {
            Surface(
                shape = RoundedCornerShape(CinemaRadius.container),
                color = palette.slate,
                border = BorderStroke(1.dp, palette.border)
            ) {
                Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Danh sách tập (${episodes.size.coerceAtLeast(1)})",
                            color = palette.ivory,
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.5.sp
                        )
                        Surface(
                            shape = RoundedCornerShape(6.dp),
                            color = palette.goldMuted,
                            border = BorderStroke(1.dp, palette.gold.copy(alpha = 0.35f)),
                            modifier = Modifier.clickable { onDiscoverEpisodes() }
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(4.dp)
                            ) {
                                if (isDiscovering) {
                                    CircularProgressIndicator(color = palette.gold, strokeWidth = 2.dp, modifier = Modifier.size(12.dp))
                                } else {
                                    Icon(Icons.Filled.Search, contentDescription = null, tint = palette.gold, modifier = Modifier.size(13.dp))
                                }
                                Text("Tìm thêm tập", color = palette.gold, fontSize = 11.5.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    if (episodes.isNotEmpty()) {
                        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            itemsIndexed(episodes) { idx, ep ->
                                val active = ep.id == film.id
                                val epNum = PhimAiUtils.getEpisodeNumber(ep.title) ?: (idx + 1)
                                Surface(
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (active) palette.gold else palette.slateRaised,
                                    border = BorderStroke(1.dp, if (active) palette.gold else palette.border),
                                    modifier = Modifier.clickable { if (!active) onSelectEpisode(ep.id) }
                                ) {
                                    Text(
                                        text = "Tập $epNum",
                                        color = if (active) palette.obsidian else palette.ivory,
                                        fontSize = 12.5.sp,
                                        fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 7.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Description Box
        Surface(
            shape = RoundedCornerShape(CinemaRadius.container),
            color = palette.slate,
            border = BorderStroke(1.dp, palette.border),
            modifier = Modifier.clickable { expandDesc = !expandDesc }
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = "${PhimAiUtils.formatViewsVN(film.views)} • ${film.dur.ifBlank { PhimAiUtils.catLabel(film.cat) }} • ${PhimAiUtils.catLabel(film.cat)}",
                    color = palette.ivory,
                    fontSize = 12.5.sp,
                    fontWeight = FontWeight.SemiBold
                )
                val body = film.blurbLong.ifBlank { film.blurb }
                if (body.isNotBlank()) {
                    Text(
                        text = body,
                        color = palette.textSecondary,
                        fontSize = 12.5.sp,
                        maxLines = if (expandDesc) Int.MAX_VALUE else 3,
                        overflow = TextOverflow.Ellipsis
                    )
                }
                if (film.tags.isNotEmpty()) {
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        film.tags.take(6).forEach { t ->
                            Text("#$t", color = palette.gold, fontSize = 11.sp, fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CommentsComposerSection(
    count: Int,
    draftText: String,
    authorName: String,
    attachTimestamp: Boolean,
    isPosting: Boolean,
    onDraftChange: (String) -> Unit,
    onNameChange: (String) -> Unit,
    onToggleTimestamp: () -> Unit,
    onSubmit: () -> Unit
) {
    val palette = cinema
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        Text("Bình luận ($count)", color = palette.ivory, fontSize = 15.sp, fontWeight = FontWeight.Bold)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = authorName,
                onValueChange = onNameChange,
                placeholder = { Text("Tên của bạn", fontSize = 12.sp, color = palette.textMuted) },
                singleLine = true,
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.gold,
                    unfocusedBorderColor = palette.border,
                    focusedTextColor = palette.ivory,
                    unfocusedTextColor = palette.ivory
                ),
                modifier = Modifier.weight(0.36f)
            )
            OutlinedTextField(
                value = draftText,
                onValueChange = onDraftChange,
                placeholder = { Text("Viết bình luận...", fontSize = 12.sp, color = palette.textMuted) },
                singleLine = true,
                shape = RoundedCornerShape(8.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = palette.gold,
                    unfocusedBorderColor = palette.border,
                    focusedTextColor = palette.ivory,
                    unfocusedTextColor = palette.ivory
                ),
                modifier = Modifier.weight(0.64f)
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Surface(
                shape = RoundedCornerShape(6.dp),
                color = if (attachTimestamp) palette.goldMuted else palette.slate,
                border = BorderStroke(1.dp, if (attachTimestamp) palette.gold else palette.border),
                modifier = Modifier.clickable { onToggleTimestamp() }
            ) {
                Text(
                    text = if (attachTimestamp) "Có gắn mốc thời gian" else "Gắn mốc hiện tại",
                    color = if (attachTimestamp) palette.gold else palette.textMuted,
                    fontSize = 11.5.sp,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
                )
            }
            OutlinedButton(
                onClick = onSubmit,
                enabled = draftText.isNotBlank() && !isPosting
            ) {
                Text(if (isPosting) "Đang gửi..." else "Gửi", color = palette.gold, fontWeight = FontWeight.Bold)
            }
        }
        HorizontalDivider(color = palette.border)
    }
}

@Composable
private fun CommentRow(
    comment: CommentItem,
    onSeekStamp: (Int) -> Unit
) {
    val palette = cinema
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 14.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        ChannelInitialAvatar(name = comment.name.ifBlank { "K" }, size = 32.dp)
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(comment.name.ifBlank { "Khán giả" }, color = palette.ivory, fontSize = 12.5.sp, fontWeight = FontWeight.SemiBold)
                if (comment.d.isNotBlank()) {
                    Text(comment.d, color = palette.textDisabled, fontSize = 11.sp)
                }
                if (comment.s > 0) {
                    Surface(
                        shape = RoundedCornerShape(4.dp),
                        color = palette.goldMuted,
                        modifier = Modifier.clickable { onSeekStamp(comment.s) }
                    ) {
                        Text(
                            text = PhimAiUtils.formatClock(comment.s.toLong()),
                            color = palette.gold,
                            fontSize = 10.5.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 1.dp)
                        )
                    }
                }
            }
            Text(comment.text, color = palette.textSecondary, fontSize = 13.sp)
        }
    }
}

package com.phimai.android.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.phimai.android.data.repository.PhimAiRepository
import com.phimai.android.player.PlaybackManager
import com.phimai.android.ui.adaptive.LocalWindowState
import com.phimai.android.ui.components.CenteredContent
import com.phimai.android.ui.components.FilmCard
import com.phimai.android.ui.components.FloatingMiniPlayer
import com.phimai.android.ui.components.MiniPlayer
import com.phimai.android.ui.components.PhimAiLogo
import com.phimai.android.ui.components.gridHorizontalSpacing
import com.phimai.android.ui.components.gridVerticalSpacing
import com.phimai.android.ui.components.rememberVideoGridCells
import com.phimai.android.ui.navigation.AppNavigationRail
import com.phimai.android.ui.navigation.BottomNavBar
import com.phimai.android.ui.navigation.PhimAiNavGraph
import com.phimai.android.ui.navigation.Screen
import com.phimai.android.ui.screens.search.SearchUiState
import com.phimai.android.ui.screens.search.SearchViewModel
import com.phimai.android.ui.theme.cinema
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import javax.inject.Inject

@HiltViewModel
class ShellViewModel @Inject constructor(
    val playbackManager: PlaybackManager,
    val fullscreenController: FullscreenController,
    val repository: PhimAiRepository
) : ViewModel()

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen() {
    val palette = cinema
    val navController = rememberNavController()
    val searchViewModel: SearchViewModel = hiltViewModel()
    val shellViewModel: ShellViewModel = hiltViewModel()

    var isSearchActive by remember { mutableStateOf(false) }
    val searchUiState by searchViewModel.uiState.collectAsState()
    val searchServerUrl by searchViewModel.serverUrl.collectAsState()
    val searchSavedIds by searchViewModel.savedIds.collectAsState()
    val searchProgress by searchViewModel.progressMap.collectAsState()

    val focusManager = LocalFocusManager.current
    val focusRequester = remember { FocusRequester() }

    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val playbackManager = shellViewModel.playbackManager
    val nowPlaying by playbackManager.nowPlaying.collectAsState()
    val isPlayerFullscreen by shellViewModel.fullscreenController.isFullscreen.collectAsState()

    var onlineCount by remember { mutableIntStateOf(0) }
    LaunchedEffect(Unit) {
        runCatching { shellViewModel.repository.getStats() }
            .onSuccess { onlineCount = it.online }
    }

    val isWatchRoute = currentRoute?.startsWith("watch/") == true
    val showMiniPlayer = remember(nowPlaying, currentRoute) {
        nowPlaying != null && !isWatchRoute
    }

    BackHandler(enabled = isSearchActive) {
        if (searchUiState.query.isNotEmpty()) {
            searchViewModel.onQueryChanged("")
            focusRequester.requestFocus()
        } else {
            isSearchActive = false
        }
    }

    val windowState = LocalWindowState.current
    val hideScaffoldChrome = isPlayerFullscreen || isWatchRoute
    val showRail = windowState.useNavigationRail && !hideScaffoldChrome
    val showBottomNav = !hideScaffoldChrome && !showRail
    val showFullSearch = isSearchActive && (searchUiState.hasSearched || searchUiState.isLoading || searchUiState.results.isNotEmpty())

    val onNavTabClick: (String) -> Unit = {
        isSearchActive = false
        searchViewModel.onQueryChanged("")
        focusManager.clearFocus()
    }

    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(palette.obsidian)
    ) {
        if (showRail) {
            AppNavigationRail(
                navController = navController,
                onTabClick = onNavTabClick
            )
        }

        Scaffold(
            modifier = Modifier
                .weight(1f)
                .fillMaxHeight()
                .then(
                    if (showRail) {
                        Modifier.consumeWindowInsets(WindowInsets.systemBars.only(WindowInsetsSides.Start))
                    } else Modifier
                ),
            contentWindowInsets = when {
                hideScaffoldChrome -> WindowInsets(0, 0, 0, 0)
                showRail -> WindowInsets.systemBars.only(
                    WindowInsetsSides.Top + WindowInsetsSides.End + WindowInsetsSides.Bottom
                )
                else -> ScaffoldDefaults.contentWindowInsets
            },
            topBar = {
                if (!hideScaffoldChrome) {
                    Box(modifier = Modifier.animateContentSize()) {
                        if (isSearchActive) {
                            TopAppBar(
                                expandedHeight = if (showRail) 56.dp else TopAppBarDefaults.TopAppBarExpandedHeight,
                                title = {
                                    TextField(
                                        value = searchUiState.query,
                                        onValueChange = { searchViewModel.onQueryChanged(it) },
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .focusRequester(focusRequester),
                                        placeholder = {
                                            Text("Tìm kiếm phim AI, kênh, thể loại...", color = palette.textMuted, fontSize = 14.sp)
                                        },
                                        singleLine = true,
                                        colors = TextFieldDefaults.colors(
                                            focusedContainerColor = Color.Transparent,
                                            unfocusedContainerColor = Color.Transparent,
                                            focusedIndicatorColor = Color.Transparent,
                                            unfocusedIndicatorColor = Color.Transparent,
                                            focusedTextColor = palette.ivory,
                                            unfocusedTextColor = palette.ivory,
                                            cursorColor = palette.gold
                                        ),
                                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                                        keyboardActions = KeyboardActions(
                                            onSearch = {
                                                searchViewModel.searchImmediate(searchUiState.query)
                                                focusManager.clearFocus()
                                            }
                                        )
                                    )
                                },
                                navigationIcon = {
                                    IconButton(onClick = {
                                        if (searchUiState.query.isNotEmpty()) {
                                            searchViewModel.onQueryChanged("")
                                            focusRequester.requestFocus()
                                        } else {
                                            isSearchActive = false
                                            focusManager.clearFocus()
                                        }
                                    }) {
                                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Quay lại", tint = palette.ivory)
                                    }
                                },
                                actions = {
                                    if (searchUiState.query.isNotEmpty()) {
                                        IconButton(onClick = {
                                            searchViewModel.onQueryChanged("")
                                            focusRequester.requestFocus()
                                        }) {
                                            Icon(Icons.Filled.Close, contentDescription = "Xóa", tint = palette.textSecondary)
                                        }
                                    }
                                },
                                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.obsidian)
                            )
                        } else {
                            TopAppBar(
                                expandedHeight = if (showRail) 56.dp else TopAppBarDefaults.TopAppBarExpandedHeight,
                                title = {
                                    PhimAiLogo(
                                        iconSize = 26.dp,
                                        showWordmark = true,
                                        show4KBadge = true,
                                        onlineCount = if (windowState.isWide && onlineCount > 0) onlineCount else null
                                    )
                                },
                                actions = {
                                    IconButton(onClick = { isSearchActive = true }) {
                                        Icon(Icons.Filled.Search, contentDescription = "Tìm kiếm", tint = palette.ivory)
                                    }
                                },
                                colors = TopAppBarDefaults.topAppBarColors(containerColor = palette.obsidian)
                            )
                        }
                    }
                }
            },
            bottomBar = {
                if (!hideScaffoldChrome) {
                    if (!windowState.isWide) {
                        Column {
                            AnimatedVisibility(
                                visible = showMiniPlayer,
                                enter = slideInVertically(initialOffsetY = { it }) + fadeIn(),
                                exit = slideOutVertically(targetOffsetY = { it }) + fadeOut()
                            ) {
                                nowPlaying?.let { np ->
                                    MiniPlayer(
                                        nowPlaying = np,
                                        player = playbackManager.player,
                                        onOpen = {
                                            navController.navigate(Screen.Watch.createRoute(np.filmId)) {
                                                launchSingleTop = true
                                            }
                                        },
                                        onClose = { playbackManager.stopAndClear() }
                                    )
                                }
                            }
                            BottomNavBar(
                                navController = navController,
                                onTabClick = onNavTabClick
                            )
                        }
                    } else if (showBottomNav) {
                        BottomNavBar(
                            navController = navController,
                            onTabClick = onNavTabClick
                        )
                    }
                }
            },
            containerColor = palette.obsidian
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .then(if (hideScaffoldChrome) Modifier else Modifier.padding(innerPadding))
            ) {
                if (showFullSearch) {
                    SearchResultsGrid(
                        uiState = searchUiState,
                        serverUrl = searchServerUrl,
                        savedIds = searchSavedIds,
                        progressMap = searchProgress,
                        onFilmClick = { id ->
                            isSearchActive = false
                            searchViewModel.onQueryChanged("")
                            navController.navigate(Screen.Watch.createRoute(id))
                        },
                        onToggleSave = { searchViewModel.toggleSave(it) },
                        onChannelClick = { ch ->
                            isSearchActive = false
                            searchViewModel.onQueryChanged("")
                            navController.navigate(Screen.ChannelDetail.createRoute(ch))
                        }
                    )
                } else {
                    PhimAiNavGraph(navController = navController)
                }

                androidx.compose.animation.AnimatedVisibility(
                    visible = showMiniPlayer && windowState.isWide && !hideScaffoldChrome,
                    enter = fadeIn() + slideInVertically(initialOffsetY = { it / 2 }),
                    exit = fadeOut() + slideOutVertically(targetOffsetY = { it / 2 }),
                    modifier = Modifier
                        .align(Alignment.BottomEnd)
                        .padding(end = 14.dp, bottom = 14.dp)
                ) {
                    nowPlaying?.let { np ->
                        FloatingMiniPlayer(
                            nowPlaying = np,
                            player = playbackManager.player,
                            onOpen = {
                                navController.navigate(Screen.Watch.createRoute(np.filmId)) {
                                    launchSingleTop = true
                                }
                            },
                            onClose = { playbackManager.stopAndClear() }
                        )
                    }
                }
            }
        }
    }

    if (isSearchActive) {
        LaunchedEffect(isSearchActive) {
            runCatching {
                delay(100)
                focusRequester.requestFocus()
            }
        }
    }
}

@Composable
private fun SearchResultsGrid(
    uiState: SearchUiState,
    serverUrl: String,
    savedIds: Set<String>,
    progressMap: Map<String, Float>,
    onFilmClick: (String) -> Unit,
    onToggleSave: (com.phimai.android.data.model.Film) -> Unit,
    onChannelClick: (String) -> Unit
) {
    val palette = cinema
    CenteredContent {
        when {
            uiState.isLoading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = palette.gold)
            }
            uiState.error != null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(uiState.error ?: "Lỗi tìm kiếm", color = palette.crimsonSoft)
            }
            uiState.hasSearched && uiState.results.isEmpty() -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Không có kết quả cho \"${uiState.query}\"", color = palette.textMuted)
            }
            else -> LazyVerticalGrid(
                columns = rememberVideoGridCells(),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(gridHorizontalSpacing()),
                verticalArrangement = Arrangement.spacedBy(gridVerticalSpacing())
            ) {
                items(uiState.results, key = { it.id }) { film ->
                    FilmCard(
                        film = film,
                        serverUrl = serverUrl,
                        isSaved = film.id in savedIds,
                        progressFraction = progressMap[film.id],
                        onFilmClick = { clicked -> onFilmClick(clicked.id) },
                        onToggleSave = onToggleSave,
                        onChannelClick = onChannelClick
                    )
                }
            }
        }
    }
}

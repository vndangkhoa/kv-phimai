package com.phimai.android.di

import android.content.Context
import androidx.room.Room
import com.phimai.android.data.local.PhimAiDatabase
import com.phimai.android.data.local.SavedFilmDao
import com.phimai.android.data.local.SubscribedChannelDao
import com.phimai.android.data.local.WatchHistoryDao
import com.phimai.android.data.net.PhimAiHttp
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        coerceInputValues = true
        isLenient = true
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(): OkHttpClient = PhimAiHttp.client

    @Provides
    @Singleton
    fun provideHttpClient(okHttpClient: OkHttpClient, json: Json): HttpClient =
        HttpClient(OkHttp) {
            engine {
                preconfigured = okHttpClient
            }
            install(ContentNegotiation) {
                json(json)
            }
            install(HttpTimeout) {
                requestTimeoutMillis = 25_000
                connectTimeoutMillis = 15_000
                socketTimeoutMillis = 30_000
            }
        }

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): PhimAiDatabase =
        Room.databaseBuilder(context, PhimAiDatabase::class.java, "phimai.db")
            .fallbackToDestructiveMigration()
            .build()

    @Provides
    fun provideWatchHistoryDao(db: PhimAiDatabase): WatchHistoryDao = db.watchHistoryDao()

    @Provides
    fun provideSavedFilmDao(db: PhimAiDatabase): SavedFilmDao = db.savedFilmDao()

    @Provides
    fun provideSubscribedChannelDao(db: PhimAiDatabase): SubscribedChannelDao = db.subscribedChannelDao()
}

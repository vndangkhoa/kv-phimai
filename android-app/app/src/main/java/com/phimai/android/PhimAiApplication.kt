package com.phimai.android

import android.app.Application
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import com.phimai.android.data.net.PhimAiHttp
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class PhimAiApplication : Application(), SingletonImageLoader.Factory {
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components {
                add(OkHttpNetworkFetcherFactory(callFactory = { PhimAiHttp.client }))
            }
            .build()
}

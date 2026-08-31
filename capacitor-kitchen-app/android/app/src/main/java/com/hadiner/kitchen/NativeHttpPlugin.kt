package com.hadiner.kitchen

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

// Plain HttpURLConnection-based HTTP client, run from Kotlin — deliberately
// NOT Capacitor's own `CapacitorHttp` plugin. Two reasons:
//  1. CapacitorHttp performs its fetch-routing setup inside its own internal
//     DOMContentLoaded listener, which can silently race with — and be
//     bypassed by — any other script that also wraps window.fetch
//     synchronously (see www-inject/fetch-bridge.js in this app).
//  2. A request made here never touches the WebView, so there is no
//     "cross-origin" at all — CORS is a browser concept enforced by the
//     WebView's script engine, not by the OS socket layer this plugin uses.
@CapacitorPlugin(name = "NativeHttp")
class NativeHttpPlugin : Plugin() {

    @PluginMethod
    fun request(call: PluginCall) {
        val urlString = call.getString("url")
        if (urlString == null) {
            call.reject("Missing 'url'")
            return
        }
        val method = (call.getString("method") ?: "GET").uppercase()
        val headers = call.getObject("headers") ?: JSObject()
        val body = call.getString("body")

        Thread {
            var connection: HttpURLConnection? = null
            try {
                val url = URL(urlString)
                connection = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = method
                    connectTimeout = 15000
                    readTimeout = 15000
                    instanceFollowRedirects = true
                }

                val headerKeys = headers.keys()
                while (headerKeys.hasNext()) {
                    val key = headerKeys.next()
                    connection.setRequestProperty(key, headers.getString(key))
                }

                if (body != null && method != "GET" && method != "HEAD") {
                    connection.doOutput = true
                    if (connection.getRequestProperty("Content-Type") == null) {
                        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                    }
                    OutputStreamWriter(connection.outputStream, StandardCharsets.UTF_8).use { it.write(body) }
                }

                val status = connection.responseCode
                val stream = if (status in 200..399) connection.inputStream else connection.errorStream
                val text = stream?.let {
                    BufferedReader(InputStreamReader(it, StandardCharsets.UTF_8)).use { reader -> reader.readText() }
                } ?: ""

                val responseHeaders = JSObject()
                for ((key, values) in connection.headerFields) {
                    if (key != null && values.isNotEmpty()) responseHeaders.put(key, values[0])
                }

                val ret = JSObject()
                ret.put("status", status)
                ret.put("data", text)
                ret.put("headers", responseHeaders)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("NativeHttp request failed: ${e.message}", e)
            } finally {
                connection?.disconnect()
            }
        }.start()
    }
}

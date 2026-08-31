package com.hadiner.kitchen

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager
import android.os.Build
import android.util.Base64
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

// Native USB thermal-printer bridge. Exists because Chrome/WebUSB cannot
// claim a USB interface that Android's kernel `usblp` driver already holds —
// that is a Chromium limitation with no non-root workaround. A native app can:
// UsbDeviceConnection.claimInterface(iface, force = true) detaches the kernel
// driver and claims the interface for this app instead.
@CapacitorPlugin(name = "UsbThermalPrinter")
class UsbThermalPrinterPlugin : Plugin() {
    companion object {
        private const val TAG = "UsbThermalPrinter"
        private const val ACTION_USB_PERMISSION = "com.hadiner.kitchen.USB_PERMISSION"
        private const val USB_PRINTER_CLASS = UsbConstants.USB_CLASS_PRINTER // 7
    }

    private var connection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var outEndpoint: UsbEndpoint? = null
    private var pendingConnectCall: PluginCall? = null
    private var permissionReceiverRegistered = false

    private val usbManager: UsbManager
        get() = context.getSystemService(Context.USB_SERVICE) as UsbManager

    private val permissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != ACTION_USB_PERMISSION) return
            synchronized(this) {
                val device: UsbDevice? = intent.getParcelableExtra(UsbManager.EXTRA_DEVICE)
                val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
                val call = pendingConnectCall
                pendingConnectCall = null
                if (granted && device != null) {
                    openDevice(device, call)
                } else {
                    Log.w(TAG, "USB permission denied for device ${device?.deviceName}")
                    call?.reject("USB permission denied")
                }
            }
        }
    }

    override fun load() {
        super.load()
        val filter = IntentFilter(ACTION_USB_PERMISSION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(permissionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(permissionReceiver, filter)
        }
        permissionReceiverRegistered = true
    }

    override fun handleOnDestroy() {
        if (permissionReceiverRegistered) {
            try { context.unregisterReceiver(permissionReceiver) } catch (e: Exception) { /* already gone */ }
            permissionReceiverRegistered = false
        }
        super.handleOnDestroy()
    }

    // connect({ vendorId?, productId? }) — with no ids, auto-picks the first
    // attached device that reports the USB Printer Class (interfaceClass == 7),
    // which is what thermal receipt printers like the HPRT TP801 report over USB.
    @PluginMethod
    fun connect(call: PluginCall) {
        val vendorId = if (call.hasOption("vendorId")) call.getInt("vendorId") else null
        val productId = if (call.hasOption("productId")) call.getInt("productId") else null

        val device = findDevice(vendorId, productId)
        if (device == null) {
            Log.w(TAG, "connect: no matching USB device found (vendorId=$vendorId productId=$productId)")
            call.reject("No matching USB printer found")
            return
        }

        if (usbManager.hasPermission(device)) {
            openDevice(device, call)
            return
        }

        pendingConnectCall = call
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            android.app.PendingIntent.FLAG_MUTABLE
        } else 0
        val permissionIntent = android.app.PendingIntent.getBroadcast(
            context, 0, Intent(ACTION_USB_PERMISSION), flags
        )
        usbManager.requestPermission(device, permissionIntent)
    }

    // Like connect(), but never shows the Android USB permission dialog — only
    // succeeds if this app was already granted permission for the device in a
    // previous session. Mirrors the old WebUSB flow's silent reconnect
    // (navigator.usb.getDevices(), which only returns already-authorized
    // devices), so the app doesn't pop a permission prompt on every launch
    // before the user has done anything.
    @PluginMethod
    fun reconnectSilently(call: PluginCall) {
        val device = findDevice(null, null)
        if (device == null || !usbManager.hasPermission(device)) {
            val ret = JSObject()
            ret.put("connected", false)
            call.resolve(ret)
            return
        }
        openDevice(device, call)
    }

    @PluginMethod
    fun isConnected(call: PluginCall) {
        val ret = JSObject()
        ret.put("connected", connection != null && outEndpoint != null)
        call.resolve(ret)
    }

    // printBytes({ data: base64 }) — raw ESC/POS bytes, sent as-is over the
    // printer's USB bulk-OUT endpoint.
    @PluginMethod
    fun printBytes(call: PluginCall) {
        val conn = connection
        val iface = usbInterface
        val endpoint = outEndpoint
        if (conn == null || iface == null || endpoint == null) {
            call.reject("Printer not connected")
            return
        }
        val b64 = call.getString("data")
        if (b64 == null) {
            call.reject("Missing 'data' (base64)")
            return
        }
        val bytes = try {
            Base64.decode(b64, Base64.DEFAULT)
        } catch (e: IllegalArgumentException) {
            call.reject("Invalid base64 data: ${e.message}")
            return
        }

        // Chunk to the endpoint's max packet size — large single transfers can
        // fail silently on some USB printer controllers.
        val chunkSize = if (endpoint.maxPacketSize > 0) endpoint.maxPacketSize else 512
        var offset = 0
        while (offset < bytes.size) {
            val len = minOf(chunkSize, bytes.size - offset)
            val sent = conn.bulkTransfer(endpoint, bytes, offset, len, 5000)
            if (sent < 0) {
                Log.e(TAG, "bulkTransfer failed at offset $offset (errno via -1, see logcat UsbRequest)")
                call.reject("USB bulkTransfer failed at offset $offset")
                return
            }
            offset += len
        }
        call.resolve()
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        try {
            usbInterface?.let { connection?.releaseInterface(it) }
            connection?.close()
        } catch (e: Exception) {
            Log.w(TAG, "disconnect: ${e.message}")
        } finally {
            connection = null
            usbInterface = null
            outEndpoint = null
        }
        call.resolve()
    }

    private fun findDevice(vendorId: Int?, productId: Int?): UsbDevice? {
        val devices = usbManager.deviceList.values
        if (vendorId != null && productId != null) {
            return devices.find { it.vendorId == vendorId && it.productId == productId }
        }
        // Fall back to USB Printer Class detection (interfaceClass == 7).
        return devices.find { device ->
            (0 until device.interfaceCount).any { i -> device.getInterface(i).interfaceClass == USB_PRINTER_CLASS }
        }
    }

    private fun openDevice(device: UsbDevice, call: PluginCall?) {
        val iface = (0 until device.interfaceCount)
            .map { device.getInterface(it) }
            .find { it.interfaceClass == USB_PRINTER_CLASS }
            ?: device.getInterface(0) // fall back to interface 0 if class doesn't match (some clones misreport it)

        val endpoint = (0 until iface.endpointCount)
            .map { iface.getEndpoint(it) }
            .find { it.direction == UsbConstants.USB_DIR_OUT }

        if (endpoint == null) {
            Log.e(TAG, "openDevice: no bulk-OUT endpoint on interface ${iface.id}")
            call?.reject("No OUT endpoint on USB interface")
            return
        }

        val conn = usbManager.openDevice(device)
        if (conn == null) {
            Log.e(TAG, "openDevice: usbManager.openDevice() returned null for ${device.deviceName}")
            call?.reject("Could not open USB device")
            return
        }

        // This is the step WebUSB/Chrome cannot do without root: force-claim
        // the interface even though Android's kernel usblp driver already
        // holds it, detaching that driver so this app owns the interface.
        val claimed = try {
            conn.claimInterface(iface, true)
        } catch (e: Exception) {
            Log.e(TAG, "claimInterface threw: ${e.javaClass.simpleName}: ${e.message}", e)
            false
        }
        if (!claimed) {
            Log.e(TAG, "claimInterface(force=true) returned false for interface ${iface.id} on ${device.deviceName}")
            conn.close()
            call?.reject("Failed to claim USB interface (claimInterface force=true returned false)")
            return
        }

        connection = conn
        usbInterface = iface
        outEndpoint = endpoint
        Log.i(TAG, "USB printer connected: ${device.deviceName} (vendor=${device.vendorId} product=${device.productId})")

        val ret = JSObject()
        ret.put("connected", true)
        ret.put("vendorId", device.vendorId)
        ret.put("productId", device.productId)
        call?.resolve(ret)
    }
}

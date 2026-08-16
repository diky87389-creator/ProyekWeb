# Smart Guide Toast Notification - Documentation

## Overview
Floating Toast Notification system untuk memandu pengguna kembali ke halaman terakhir pesanan mereka dalam alur e-commerce "Warung Sayur Diky".

## Fitur Utama
- **State Tracking**: Mendeteksi posisi terakhir pengguna berdasarkan localStorage
- **Smart Navigation**: Mengarahkan pengguna ke halaman yang relevan (keranjang, checkout, atau success)
- **Modern UI/UX**: Desain minimalis dengan animasi halus dan efek visual yang menarik
- **Responsive**: Berfungsi optimal di semua ukuran layar
- **Modular**: Tidak merusak fungsi kode yang sudah ada

## File yang Dibuat
1. **smart-guide-toast.css** - Styling untuk floating toast notification
2. **smart-guide-toast.js** - Logika JavaScript untuk state tracking dan navigasi

## Integrasi
Fitur sudah diintegrasikan ke:
- `keranjang.html` + `keranjang.js`
- `checkout.html` + `checkout.js` 
- `success.html` + `success.js`

## Cara Kerja

### 1. Deteksi Posisi Terakhir
Sistem mengecek localStorage untuk menentukan halaman terakhir:
- **dikyLastOrder** ada → `success.html` (Pesanan selesai)
- **dikyCheckoutForm** ada → `checkout.html` (Sedang checkout)
- **dikyCart** ada → `keranjang.html` (Di keranjang)

### 2. Tampilan Toast
Toast muncul di sudut kanan bawah dengan:
- Icon yang beranimasi
- Judul yang relevan dengan status pesanan
- Pesan yang jelas dan ramah
- Tombol "Pantau Pesanan Kamu Disini"

### 3. Navigasi
Ketika tombol diklik, sistem mengarahkan pengguna ke halaman terakhir yang terdeteksi.

## Pesan yang Ditampilkan

### Jika di keranjang.html:
- **Judul**: 🛒 Pesanan Kamu Menunggu
- **Pesan**: Kamu memiliki item di keranjang belanja. Lanjutkan pembayaran sekarang.

### Jika di checkout.html:
- **Judul**: 💳 Checkout Belum Selesai
- **Pesan**: Proses pembayaran kamu tertunda. Selesaikan pesanan sekarang.

### Jika di success.html:
- **Judul**: ✅ Pesanan Berhasil
- **Pesan**: Pesanan terakhir kamu telah selesai. Lihat detail pesanan.

## Pengaturan Default
- **Auto Show Delay**: 3 detik setelah halaman dimuat
- **Auto Hide Delay**: 8 detik setelah muncul
- **Position**: Fixed di sudut kanan bawah
- **Z-Index**: 9999 (di atas elemen lain)

## Customization (Opsional)

### Mengubah Delay
Di `smart-guide-toast.js`, ubah konfigurasi:
```javascript
config: {
  autoShowDelay: 3000,  // Delay tampil (ms)
  autoHideDelay: 8000,  // Delay sembunyi (ms)
  // ...
}
```

### Trigger Manual
Untuk menampilkan toast secara manual:
```javascript
SmartGuide.manualShow(
  'Judul Custom',
  'Pesan custom kamu di sini',
  'Tombol Custom'
);
```

### Disable Auto Show
Untuk menonaktifkan tampil otomatis, comment out baris ini di setiap halaman:
```javascript
// SmartGuide.init();
```

## Browser Support
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Troubleshooting

### Toast tidak muncul
1. Pastikan file CSS dan JS sudah diload dengan benar
2. Cek console untuk error JavaScript
3. Pastikan localStorage tersedia di browser

### Navigasi tidak bekerja
1. Pastikan nama file halaman sesuai dengan yang terdeteksi
2. Cek apakah localStorage memiliki data yang valid
3. Verifikasi path file HTML yang benar

## Performance
- **Minimal DOM Impact**: Hanya menambahkan 1 elemen saat aktif
- **Clean Memory**: Elemen dihapus setelah animasi selesai
- **No Dependencies**: Pure JavaScript, tidak butuh library tambahan

## Future Enhancements (Opsional)
- A/B testing untuk pesan yang berbeda
- Analytics tracking untuk user engagement
- Custom themes per halaman
- Sound notification opsional
- Multi-language support

## Notes
- Fitur ini tidak mengganggu fungsi yang sudah ada
- Data tracking hanya menggunakan localStorage, tidak ada server call
- Privacy-friendly: tidak mengirim data ke eksternal
- Easy to remove: cukup hapus 2 baris integrasi di setiap halaman

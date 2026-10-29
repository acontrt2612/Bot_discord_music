# Bot Discord

Bot Discord viết bằng discord.js v14. Hiện có chức năng nghe nhạc (YouTube, SoundCloud và các trang yt-dlp hỗ trợ).

## Cài đặt

1. Tạo bot tại https://discord.com/developers/applications
   - Tab **Bot**: bấm *Reset Token* để lấy token.
   - Tab **OAuth2 > URL Generator**: chọn scope `bot` + `applications.commands`, quyền `Connect`, `Speak`, `Send Messages`, `Embed Links`. Mở link được tạo để mời bot vào server.
2. Copy `.env.example` thành `.env` rồi điền `DISCORD_TOKEN`, `CLIENT_ID` (và `GUILD_ID` nếu muốn lệnh hiện ngay trong server test).
3. Cài và chạy:

```bash
npm install
npm run deploy   # đăng ký slash command (chạy lại khi thêm/sửa lệnh)
npm start
```

ffmpeg và yt-dlp được tải tự động qua `ffmpeg-static` và `youtube-dl-exec`, không cần cài riêng.

## Bảng điều khiển nhạc

Mỗi khi chuyển bài, bot gửi một bảng điều khiển gồm bài đang phát, thanh tiến trình, 10 bài tiếp theo, menu bài gợi ý (lấy từ YouTube Mix) và các nút:

| | | | | |
|---|---|---|---|---|
| ▶️ Tiếp tục | ⏮️ Bài trước | ⏸️ Tạm dừng | ⏭️ Bỏ qua | 🔁 Lặp (tắt → bài → hàng đợi) |
| 🔉 Giảm âm lượng | ⏪ Lùi 10s | ❤️ Thích bài | ⏩ Tua 10s | 🔊 Tăng âm lượng |
| 🎤 Lời bài hát | 🔀 Xáo trộn | ✖️ Dừng | 🎚️ Bộ lọc | 📻 Tự phát |

Chỉ người đang ở cùng kênh thoại với bot mới bấm được các nút điều khiển. Riêng ❤️ và 🎤 thì ai cũng dùng được.

## Lệnh nhạc

| Lệnh | Mô tả |
|---|---|
| `/play <query>` | Phát theo tên bài, link video hoặc link playlist |
| `/skip`, `/previous` | Bỏ qua / quay lại bài trước |
| `/stop` | Dừng, xoá hàng đợi, rời kênh |
| `/pause`, `/resume` | Tạm dừng / tiếp tục |
| `/seek <time>` | Tua đến thời điểm (`1:30` hoặc `90`) |
| `/nowplaying` | Gửi lại bảng điều khiển xuống cuối kênh |
| `/queue [page]` | Xem toàn bộ hàng đợi |
| `/volume <0-150>` | Âm lượng |
| `/loop <off\|track\|queue>` | Chế độ lặp |
| `/shuffle` | Xáo trộn hàng đợi |
| `/remove <position>` | Xoá bài khỏi hàng đợi |
| `/filter <name>` | Bộ lọc: Bass Boost, Nightcore, Vaporwave, Slowed + Reverb, 8D, Karaoke, Tăng tốc, Treble |
| `/autoplay` | Tự phát bài liên quan khi hết hàng đợi |
| `/lyrics [query]` | Lời bài hát (nguồn lrclib.net) |
| `/liked list\|play\|clear` | Bài yêu thích (lưu ở `data/favorites.json`) |

Bot tải trước bài kế tiếp để chuyển bài nhanh, và tự rời kênh sau 3 phút không còn nhạc.

## Cấu trúc

```
src/
  index.js            # khởi động bot, xử lý interaction
  deploy-commands.js  # đăng ký slash command
  commands/
    index.js          # gom các nhóm lệnh (thêm tính năng mới ở đây)
    music.js          # các lệnh nhạc
  music/
    GuildQueue.js     # hàng đợi, phát, tua, lọc, lịch sử cho từng server
    panel.js          # dựng embed + nút của bảng điều khiển
    controls.js       # xử lý khi bấm nút / chọn menu
    constants.js      # chế độ lặp, danh sách bộ lọc ffmpeg
    lyrics.js         # tìm lời bài hát
    favorites.js      # lưu bài yêu thích
    manager.js        # Map guildId -> GuildQueue
    ytdlp.js          # tìm kiếm, gợi ý, tải audio qua yt-dlp
```

Nếu YouTube đổi cơ chế và bot không phát được, tải lại bản yt-dlp mới nhất: `npm rebuild youtube-dl-exec`.

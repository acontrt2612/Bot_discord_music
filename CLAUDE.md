# Bot Discord — ghi chú cho Claude

Bot Discord viết bằng Node.js (ESM), discord.js v14 + @discordjs/voice. Người dùng giao tiếp bằng **tiếng Việt**; mọi tin nhắn bot gửi cho người dùng Discord cũng bằng tiếng Việt.

Tính năng được làm lần lượt. Đã xong: **nghe nhạc** (kèm bảng điều khiển kiểu "Luna bot"). Khi thêm tính năng mới: tạo file lệnh trong `src/commands/`, đăng ký trong `src/commands/index.js`.

## ⚠️ Quy tắc: tự cập nhật file này (không cần người dùng nhắc)

Sau mỗi lần thay đổi code của dự án (thêm tính năng, sửa lỗi, đổi cấu trúc), **trước khi trả lời xong** phải tự sửa file CLAUDE.md này:
- Thêm một dòng vào **Nhật ký** (ngày tuyệt đối YYYY-MM-DD): đã làm gì, đã kiểm tra gì, còn gì chưa kiểm tra.
- Cập nhật **Kiến trúc** nếu thêm/xoá/đổi vai trò file; cập nhật **Quyết định kỹ thuật** nếu chọn cách làm mới hoặc đã thử cách nào thất bại (ghi lý do).
- Cập nhật **Việc tiếp theo**: xoá việc đã xong, thêm việc dở dang hoặc ý tưởng người dùng nhắc tới.
- Nếu người dùng báo kết quả chạy thật (lỗi hay chạy tốt), ghi lại.
- Giữ ngắn gọn; gộp các dòng cũ nếu nhật ký quá dài.

Câu hỏi thuần tuý không thay đổi code thì không cần ghi.

## Chạy

```bash
npm install
npm run deploy   # đăng ký slash command (chạy lại mỗi khi thêm/sửa lệnh)
npm start
```

`.env` cần `DISCORD_TOKEN`, `CLIENT_ID`, tuỳ chọn `GUILD_ID` (để lệnh hiện ngay trong server test). Xem `.env.example`.

## Kiến trúc

- `src/index.js` — client, intents `Guilds` + `GuildVoiceStates`. Slash command → `commands[name].execute`; button/select menu → `componentHandlers[prefix]` với prefix là phần trước `:` của `customId` (vd. `music:skip`).
- `src/commands/index.js` — gom `commands` và `componentHandlers`.
- `src/commands/music.js` — 17 lệnh: play, skip, previous, stop, pause, resume, seek, nowplaying, queue, volume, loop, shuffle, remove, filter, autoplay, lyrics, liked.
- `src/music/GuildQueue.js` — một instance cho mỗi server: kết nối voice, player, hàng đợi, lịch sử (để "bài trước"), lặp, autoplay, filter, volume, tải trước bài kế tiếp, quản lý message bảng điều khiển.
- `src/music/panel.js` — `buildPanel(queue)` dựng embed + 1 menu gợi ý + 3 hàng nút (15 nút).
- `src/music/controls.js` — xử lý nút/menu `music:*`.
- `src/music/ytdlp.js` — `resolve` (tìm kiếm/link/playlist), `getSuggestions` (YouTube Mix `list=RD<id>`), `AudioSource`, `createPcmStream`.
- `src/music/constants.js` — LoopMode, danh sách filter ffmpeg (có `speed` để tính đúng vị trí phát).
- `src/music/lyrics.js` — lời bài hát từ lrclib.net (không cần key), có `cleanTitle` để bỏ "OFFICIAL MUSIC VIDEO", v.v.
- `src/music/favorites.js` — bài yêu thích lưu ở `data/favorites.json` (đã gitignore).

## Quyết định kỹ thuật quan trọng (đừng đổi lại nếu không có lý do)

- **Đường audio:** yt-dlp tải bài **một lần** vào RAM (`AudioSource`, giới hạn 64MB; vượt quá thì tắt tua) → ffmpeg đọc từ bộ đệm → PCM s16le 48kHz → `StreamType.Raw` + `inlineVolume`. Tua/đổi filter = khởi động lại ffmpeg trên cùng bộ đệm (0,1–1,6s).
  - Đã thử cho ffmpeg đọc thẳng link googlevideo từ yt-dlp: **bị 403**, nên không dùng được.
  - Đã thử pipe yt-dlp → ffmpeg mỗi lần tua: tua đến phút 2 mất ~11s, quá chậm.
- Tua dùng filter `atrim=start=X` (tính theo thời gian gốc), không dùng `-ss`, để đúng cả khi filter đổi tốc độ (nightcore/vaporwave).
- Khi tua: `player.play(resourceMới)` **trước**, rồi mới kill ffmpeg cũ; làm ngược lại sẽ phát ra sự kiện Idle và bot nhảy sang bài khác.
- `EndReason` (finished/skip/previous) quyết định cách lặp và lịch sử xử lý bài vừa kết thúc.
- Các thao tác cập nhật bảng điều khiển được xếp hàng qua `panelChain` để không bị ghi đè sai thứ tự. Bảng điều khiển tự cập nhật mỗi 15s.
- Nút điều khiển: luôn `deferUpdate()` trước khi xử lý vì skip/previous/stop sẽ xoá hoặc thay message bảng điều khiển.
- yt-dlp chạy với `--js-runtimes node` (YouTube cần JS runtime; máy không có deno).
- Dùng `opusscript` thay cho `@discordjs/opus`: npm 11 chặn install script, và @discordjs/opus cần build native trên Windows.
- npm 11 chặn install script → `package.json` có `allowScripts` cho `ffmpeg-static` và `youtube-dl-exec` (để tải ffmpeg.exe và yt-dlp.exe). Nếu YouTube hỏng: `npm rebuild youtube-dl-exec` để tải lại yt-dlp mới nhất.

## Quy ước code

- ESM (`"type": "module"`), 2 dấu cách, nháy đơn, dấu phẩy cuối dòng.
- Comment bằng tiếng Anh, ngắn gọn, chỉ giải thích "tại sao"; chuỗi hiển thị cho người dùng bằng tiếng Việt kèm emoji.
- Lỗi chỉ người bấm thấy → trả lời ephemeral (`MessageFlags.Ephemeral`).

## Môi trường

Windows 11, Node 24, npm 11. Không có ffmpeg hệ thống (dùng `ffmpeg-static`). Không có GitHub CLI (`gh`).

Git: nhánh `main`, remote `origin` = https://github.com/acontrt2612/Bot_discord_music.git. Git Credential Manager đăng nhập GitHub bằng tài khoản `acontrt2612` (khác với `user.name` git là `hoangnd2612`). Push trực tiếp lên `main`.

## Nhật ký

- **2026-10-29** — Khởi tạo dự án, chức năng nghe nhạc cơ bản (/play, /skip, /stop, /pause, /resume, /queue, /volume, /loop, /shuffle, /remove).
- **2026-10-29** — Bảng điều khiển giống Luna bot: embed hàng đợi + menu "bài gợi ý" + 15 nút (resume, previous, pause, skip, loop / vol-, -10s, like, +10s, vol+ / lyrics, shuffle, stop, filter, autoplay). Thêm tua, 9 bộ lọc ffmpeg, autoplay, lời bài hát, bài yêu thích, tải trước bài kế tiếp. Các nút 🎤/🎚️/📻 là Claude tự đoán nghĩa từ icon trong ảnh Luna.
  - Đã kiểm tra: tìm kiếm, gợi ý, stream, tua, cả 9 filter, lời bài hát, logic hàng đợi (dùng adapter voice giả), panel hợp lệ với 186 bài.
  - **Chưa kiểm tra:** chạy thật trong server Discord (người dùng chưa đưa token). Nếu người dùng báo lỗi khi chạy thật, ưu tiên xem phần này.
- **2026-10-29** — Tạo CLAUDE.md làm nhật ký dự án; thêm quy tắc Claude tự cập nhật nhật ký sau mỗi thay đổi.
- **2026-10-29** — Khởi tạo git và đẩy dự án lên https://github.com/acontrt2612/Bot_discord_music.

## Việc tiếp theo / ý tưởng

- Chờ người dùng chọn tính năng tiếp theo (chưa nói cụ thể).

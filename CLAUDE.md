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

- `src/index.js` — client, intents `Guilds` + `GuildVoiceStates`. Slash command → `commands[name].execute`; button/select menu → `componentHandlers[prefix]` với prefix là phần trước `:` của `customId` (vd. `music:skip`). Log mỗi interaction + mất/kết nối lại gateway ra console. Interaction ngoài server có bot (`!inCachedGuild()`) → trả lời ephemeral "chưa mời bot" thay vì im lặng.
- `src/deploy-commands.js` — đăng ký lệnh với `contexts: [Guild]`, `integration_types: [GuildInstall]` để lệnh chỉ hiện trong server đã cài bot.
- `src/commands/index.js` — gom `commands` và `componentHandlers`.
- `src/commands/music.js` — 17 lệnh: play, skip, previous, stop, pause, resume, seek, nowplaying, queue, volume, loop, shuffle, remove, filter, autoplay, lyrics, liked.
- `src/music/GuildQueue.js` — một instance cho mỗi server: kết nối voice, player, hàng đợi, lịch sử (để "bài trước"), lặp, autoplay, filter, volume, tải trước bài kế tiếp, quản lý message bảng điều khiển.
- `src/music/panel.js` — `buildPanel(queue)` dựng embed + 1 menu gợi ý + 3 hàng nút (15 nút).
- `src/music/controls.js` — xử lý nút/menu `music:*`.
- `src/music/ytdlp.js` — `resolve` (tìm kiếm/link/playlist; chuyển link Spotify sang spotify.js), `playableUrl` (URL tải được; bài Spotify được tìm trên YouTube, lưu kết quả theo track), `getSuggestions` (YouTube Mix `list=RD<id>`), `AudioSource`, `createPcmStream`.
- `src/music/spotify.js` — đọc metadata link Spotify (track/album/playlist/artist, URI `spotify:...`, link rút gọn `spotify.link`). Track Spotify có `url` = link Spotify và `search: { query, duration }` để tìm trên YouTube.
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
- **Spotify:** nhạc có DRM, yt-dlp không hỗ trợ → chỉ lấy metadata rồi phát bản YouTube. Metadata lấy từ trang embed `open.spotify.com/embed/<type>/<id>` (JSON `__NEXT_DATA__` → `props.pageProps.state.data.entity`), **không cần API key**; giới hạn 100 bài mỗi album/playlist, nghệ sĩ là top 10. Không dùng Spotify Web API vì cần client secret và Spotify đã siết quyền cho app mới.
  - Tìm trên YouTube lúc sắp phát (lazy, trong `AudioSource`), không tìm trước cả playlist: `ytsearch5:"<nghệ sĩ> - <tên>"`, chọn kết quả đầu tiên lệch ≤7s so với thời lượng Spotify, không có thì lấy bài gần nhất. Thử 6 bài: khớp cả 6, lệch ≤1s. Bài đầu tiên mất ~12s mới có tiếng (tìm + tải); các bài sau được tải trước.
  - Nếu không tìm thấy, `AudioSource` kết thúc rỗng → player Idle → tự sang bài tiếp.
- yt-dlp chạy với `--js-runtimes node` (YouTube cần JS runtime; máy không có deno).
- Dùng `opusscript` thay cho `@discordjs/opus`: npm 11 chặn install script, và @discordjs/opus cần build native trên Windows.
- npm 11 chặn install script → `package.json` có `allowScripts` cho `ffmpeg-static` và `youtube-dl-exec` (để tải ffmpeg.exe và yt-dlp.exe). Nếu YouTube hỏng: `npm rebuild youtube-dl-exec` để tải lại yt-dlp mới nhất.

## Quy ước code

- ESM (`"type": "module"`), 2 dấu cách, nháy đơn, dấu phẩy cuối dòng.
- Comment bằng tiếng Anh, ngắn gọn, chỉ giải thích "tại sao"; chuỗi hiển thị cho người dùng bằng tiếng Việt kèm emoji.
- Lỗi chỉ người bấm thấy → trả lời ephemeral (`MessageFlags.Ephemeral`).

## Môi trường

Windows 11, Node 24, npm 11. Không có ffmpeg hệ thống (dùng `ffmpeg-static`). Không có GitHub CLI (`gh`).

Terminal PowerShell của người dùng chặn `npm.ps1` (Execution Policy). Cách xử lý: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, hoặc dùng `npm.cmd`, hoặc dùng terminal Command Prompt/Git Bash.

Git: nhánh `main`, remote `origin` = https://github.com/acontrt2612/Bot_discord_music.git. Git Credential Manager đăng nhập GitHub bằng tài khoản `acontrt2612` (khác với `user.name` git là `hoangnd2612`). Push trực tiếp lên `main`.

## Nhật ký

- **2026-10-29** — Khởi tạo dự án, chức năng nghe nhạc cơ bản (/play, /skip, /stop, /pause, /resume, /queue, /volume, /loop, /shuffle, /remove).
- **2026-10-29** — Bảng điều khiển giống Luna bot: embed hàng đợi + menu "bài gợi ý" + 15 nút (resume, previous, pause, skip, loop / vol-, -10s, like, +10s, vol+ / lyrics, shuffle, stop, filter, autoplay). Thêm tua, 9 bộ lọc ffmpeg, autoplay, lời bài hát, bài yêu thích, tải trước bài kế tiếp. Các nút 🎤/🎚️/📻 là Claude tự đoán nghĩa từ icon trong ảnh Luna.
  - Đã kiểm tra: tìm kiếm, gợi ý, stream, tua, cả 9 filter, lời bài hát, logic hàng đợi (dùng adapter voice giả), panel hợp lệ với 186 bài.
  - **Chưa kiểm tra:** chạy thật trong server Discord (người dùng chưa đưa token). Nếu người dùng báo lỗi khi chạy thật, ưu tiên xem phần này.
- **2026-10-29** — Tạo CLAUDE.md làm nhật ký dự án; thêm quy tắc Claude tự cập nhật nhật ký sau mỗi thay đổi.
- **2026-10-29** — Khởi tạo git và đẩy dự án lên https://github.com/acontrt2612/Bot_discord_music.
- **2026-10-30** — Người dùng đã tạo `.env` (bot **NDH_music**, app id `819192151703158784`, chưa đặt `GUILD_ID`) và chạy `npm run deploy` thành công: 17 lệnh đăng ký toàn cục (đã xác minh qua Discord API). Bot ở 3 server. Lệnh **chưa hiện** trong Discord → nghi bot được mời bằng link cũ (2021) thiếu scope `applications.commands`; đã đưa link mời lại: `https://discord.com/oauth2/authorize?client_id=819192151703158784&scope=bot+applications.commands&permissions=3230720` và gợi ý Ctrl+R. Chờ người dùng báo kết quả.
- **2026-10-30** — Hỗ trợ link Spotify trong `/play` (bài, album, playlist, nghệ sĩ). Bài yêu thích lưu thêm `search` để phát lại bài Spotify. Đã kiểm tra: nhận diện link, đọc track/album (18)/playlist (50)/artist, ghép YouTube đúng 6/6, gợi ý bài cho bài Spotify, stream ra PCM, test hàng đợi cũ vẫn đúng. **Chưa kiểm tra:** link `spotify.link` rút gọn thật, playlist >100 bài, phát thật trong Discord. Cần chạy lại `npm run deploy` để cập nhật mô tả `/play`.
- **2026-10-30** — Người dùng hỏi vì sao hồ sơ bot không có nút "Thêm ứng dụng". API cho thấy `bot_public: true` nhưng `install_params: null` (Install Link = None). Đã hướng dẫn bật trong Developer Portal → Installation: Guild Install + Discord Provided Link + scopes `bot`, `applications.commands` + quyền View Channels/Send Messages/Embed Links/Read Message History/Connect/Speak. Chờ người dùng xác nhận.
- **2026-10-30** — Chạy thật lần đầu: `/play` hiện trong Discord nhưng báo "NDH_music đã không phản hồi kịp thời". Bot process đang chạy (`node src/index.js` từ 9:06). Chưa rõ nguyên nhân (không có log). Nghi: lệnh gọi qua kiểu "Cài đặt người dùng" hoặc ở server không có bot → code cũ `if (!inGuild()) return` im lặng bỏ qua. Đã sửa: log mọi interaction, trả lời khi không ở server có bot, giới hạn lệnh chỉ ở server cài bot; đã chạy lại deploy (17 lệnh). Install Link vẫn chưa được lưu (`install_params` trống). **Chờ người dùng restart bot, thử lại và gửi log terminal.**
- **2026-10-30** — **Tìm ra nguyên nhân thật** của "không phản hồi kịp thời": app có `interactions_endpoint_url` = `activedev.toony.link/...` (trang lấy huy hiệu Active Developer) → Discord gửi interaction qua HTTP tới đó, gateway của bot không nhận gì. Đã xoá qua API (`PATCH /applications/@me {interactions_endpoint_url: null}`, người dùng đồng ý), kiểm tra lại = null. **Nếu sau này lệnh lại không tới bot, kiểm tra ô này đầu tiên.** Chờ người dùng thử lại `/play`.

## Việc tiếp theo / ý tưởng

- Chờ người dùng chọn tính năng tiếp theo (chưa nói cụ thể).

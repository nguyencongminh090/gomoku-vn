# 2026-11-26 22:18 — #485 Room chat input hidden under the iPhone keyboard bars
## Prompt
"Hãy sửa lỗi bàn phím che khung chat (điện thoại Iphone)" + screenshot: iOS 26 Safari, input under the ^ v ✓ bar and URL pill.
## Root cause
iOS shrinks only the visual viewport, so .room and its sticky dock keep their height; #218 only handled this with
scrollIntoView, which cannot put the dock above the layout bottom. The screenshot shows the dock ending at the keyboard
top, with iOS 26's floating bar and URL pill drawn over it.
## Fix
room.js: on iOS only, while #chat-input is focused with the keyboard up (phone, not pinch-zoom), measure the dock and set --kb /
--kb-vis + body.kb-up; iOS (except <= 18) gets 96px extra clearance (read off the screenshot, no API for it).
Detection uses clientHeight too (reports say iOS 26 may shrink innerHeight). room-arena.css: .room, sheet, scrim,
spectator pills follow --kb. Android keeps the #218 scrollIntoView path (visual- or layout-resize alike).
## Verification
- room-stage.test.js #485 block (failed before, passes after); npm test 4420/4420; cache-bust OK.
- WebKit iPhone 13, CSS only (JS off, no keyboard): dock bottom 664→568 (kb 96), →274 (kb 390); open sheet 56..217 (below the 48px nav).
- NOT verified on a real iPhone: the 96px clearance and iOS viewport values are assumptions until then.

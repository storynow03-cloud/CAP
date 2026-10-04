# 從 Word 97-2003 .doc 直接取出原始圖檔(OfficeArt BLIP),不經過 LibreOffice 重新輸出
# (LO 轉 docx 時會把 WMF/EMF 重新產生一次,虛線等畫筆樣式會遺失)
# 回傳 [(stream 名, 位移, 副檔名, bytes)],依在 stream 中出現的順序
import struct, zlib
import olefile

TYPES = {0xF01A: "emf", 0xF01B: "wmf", 0xF01C: "pict", 0xF01D: "jpg", 0xF01E: "png", 0xF01F: "dib", 0xF029: "tiff", 0xF02A: "jpg"}
# 各 BLIP 類型在 rgbUid 之後的固定標頭長度(單一 UID 時)
META_HDR = 34  # OfficeArtMetafileHeader


def _blips(buf, name):
    out, i, n = [], 0, len(buf)
    while i + 8 <= n:
        ver_inst, rtype, rlen = struct.unpack_from("<HHI", buf, i)
        if rtype in TYPES and (ver_inst & 0xF) == 0 and 0 < rlen <= n - i - 8:
            inst = ver_inst >> 4
            body = buf[i + 8:i + 8 + rlen]
            ext = TYPES[rtype]
            try:
                if ext in ("emf", "wmf", "pict"):
                    two_uid = inst in (0x3D5, 0x217, 0x543)
                    h = 16 * (2 if two_uid else 1)
                    cb_size, = struct.unpack_from("<I", body, h)
                    cb_save, comp = struct.unpack_from("<IB", body, h + 28)
                    data = body[h + META_HDR:h + META_HDR + cb_save]
                    if comp == 0: data = zlib.decompress(data)
                    if ext == "wmf" and data[:4] != b"\xd7\xcd\xc6\x9a":
                        # BLIP 裡的 WMF 不含 placeable 標頭,補上(邊界取自 metafile header 的 rcBounds/ptSize)
                        l, t, r, b = struct.unpack_from("<iiii", body, h + 4)
                        hdr = struct.pack("<IHhhhhHI", 0x9AC6CDD7, 0, l, t, r, b, 1440, 0)
                        chk = 0
                        for k in range(0, 20, 2): chk ^= struct.unpack_from("<H", hdr, k)[0]
                        data = hdr + struct.pack("<H", chk) + data
                else:
                    two_uid = inst in (0x46B, 0x6E1, 0x6E3, 0x6E5, 0x7A9, 0x6E2)
                    data = body[16 * (2 if two_uid else 1) + 1:]
                out.append((name, i, ext, data))
                i += 8 + rlen
                continue
            except Exception:
                pass
        i += 1
    return out


def extract(doc_path):
    ole = olefile.OleFileIO(doc_path)
    res = []
    for s in (["Data"], ["1Table"], ["0Table"]):
        if ole.exists("/".join(s)):
            res += _blips(ole.openstream(s).read(), "/".join(s))
    ole.close()
    return res


if __name__ == "__main__":
    import sys, os
    for name, off, ext, data in extract(sys.argv[1]):
        print(name, off, ext, len(data))

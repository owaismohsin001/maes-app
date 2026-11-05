package com.maesapp.scanner

import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * Turns the decoder's raw bytes into the code Odoo should see: the label's own
 * content and nothing else. No Android dependencies, so it stays unit-testable.
 *
 * Measured on the handheld (CM60, decoder 7.2.29-hostdec, 2026-11-05): a read
 * comes as a 128-byte result header followed by the label's data —
 *
 * | offset  | content                                                    |
 * |---------|------------------------------------------------------------|
 * | 0–23    | ISO/IEC 15424 symbology identifier, NUL-padded (`]E0`)     |
 * | 24–27   | 0xFF × 4                                                   |
 * | 28–59   | 4 corner points of the symbol in the image (int32 LE x, y) |
 * | 60–63   | int32 (18 on an EAN read)                                  |
 * | 64–127  | read time, epoch ms as ASCII digits, NUL-padded            |
 * | 128–    | the label's data (`length` covers header + data)           |
 *
 * Read as text, the header turned into junk in front of every code
 * (`]E0ÿÿÿÿ…1793887224546805…`), so Odoo found nothing. Without the header (other
 * engine settings), leading symbology identifiers and 0xFF padding are still
 * stripped.
 */
internal object ScanText {

  /** The cleaned code, and a description of what was removed ("" when nothing). */
  data class Result(val code: String, val removed: String)

  // ISO/IEC 15424: "]" + symbology code character + modifier digit (]E0, ]C1, ]Q1,
  // ]d2…). Digit only, so a code that merely starts with "]" + letters is left alone.
  private val SYMBOLOGY_ID = Regex("^\\][A-Za-z][0-9]")
  private const val PADDING: Byte = 0xFF.toByte()

  const val HEADER_SIZE = 128
  private const val ID_FIELD = 24 // bytes 0–23
  private const val TIME_FIELD = 64 // bytes 64–127

  /**
   * True when [raw] starts with the result header: a symbology identifier
   * (`]` + 2 printable characters) NUL-padded to 24 bytes, the 0xFF marker, and
   * the read time as digits at 64. All of it has to match, so a label that
   * merely starts with `]` is never cut.
   */
  private fun hasResultHeader(raw: ByteArray): Boolean {
    if (raw.size <= HEADER_SIZE || raw[0] != ']'.code.toByte()) {
      return false
    }
    if (raw[1] < '!'.code.toByte() || raw[2] < '!'.code.toByte()) {
      return false
    }
    for (i in 3 until ID_FIELD) {
      if (raw[i] != 0.toByte()) return false
    }
    for (i in ID_FIELD until ID_FIELD + 4) {
      if (raw[i] != PADDING) return false
    }
    val firstTimeByte = raw[TIME_FIELD].toInt()
    return firstTimeByte in '0'.code..'9'.code
  }

  fun clean(data: ByteArray?, length: Int): Result {
    if (data == null) {
      return Result("", "")
    }
    val all = data.copyOf(if (length in 1..data.size) length else data.size)

    // The result header: keep only the label's data after it.
    val header = hasResultHeader(all)
    val raw = if (header) all.copyOfRange(HEADER_SIZE, all.size) else all
    val headerNote =
        if (header) {
          val id = String(all, 0, 3, Charsets.ISO_8859_1)
          "result header (symbology $id, $HEADER_SIZE bytes)"
        } else {
          null
        }

    // 0xFF never occurs in UTF-8 text (nor in printable Latin-1 codes): engine padding.
    val padding = raw.count { it == PADDING }
    val bytes = if (padding == 0) raw else raw.filter { it != PADDING }.toByteArray()

    // Reads are usually ASCII; QR codes may carry UTF-8. Anything else byte for byte.
    val text =
        try {
          Charsets.UTF_8.newDecoder()
              .onMalformedInput(CodingErrorAction.REPORT)
              .onUnmappableCharacter(CodingErrorAction.REPORT)
              .decode(ByteBuffer.wrap(bytes))
              .toString()
        } catch (e: CharacterCodingException) {
          String(bytes, Charsets.ISO_8859_1)
        }

    // No control character ever leaves here: the decoder's length can include the
    // C string terminator ("1353135\u0000", which made Odoo answer HTTP 500) and a
    // suffix may add CR/LF. C1 controls and U+FFFD only come from broken bytes.
    var code =
        text
            .filterNot { it < ' ' || it == '\u007f' || it in '\u0080'..'\u009f' || it == '�' }
            .trim()

    // Leading symbology identifiers, possibly several (one per symbol the engine reports).
    val ids = mutableListOf<String>()
    while (true) {
      val match = SYMBOLOGY_ID.find(code) ?: break
      ids += match.value
      code = code.substring(match.value.length).trimStart()
    }

    val removed =
        listOfNotNull(
                headerNote,
                if (ids.isEmpty()) null else "symbology id ${ids.joinToString(" ")}",
                if (padding == 0) null else "$padding × 0xFF",
            )
            .joinToString(", ")
    return Result(code, removed)
  }
}

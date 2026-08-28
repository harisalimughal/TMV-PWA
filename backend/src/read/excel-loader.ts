import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { SheetDataset } from "./types";
import { log } from "../utils/logger";

/**
 * Parses an xlsx file into SheetDataset without external dependencies.
 * Uses the ZIP Central Directory for robust entry extraction.
 */
export function loadExcelDataset(filePath?: string): SheetDataset | null {
  const possiblePaths = [
    filePath,
    path.resolve(process.cwd(), "TMV Bot Database.xlsx"),
    path.resolve(__dirname, "../../../../TMV Bot Database.xlsx"),
    path.resolve(__dirname, "../../../TMV Bot Database.xlsx")
  ].filter(Boolean) as string[];
  
  let targetPath = possiblePaths.find(p => fs.existsSync(p));
  if (!targetPath) return null;
  

  try {
    const buffer = fs.readFileSync(targetPath);
    const entries = parseZipEntries(buffer);

    const sharedStringsXml = entries.get("xl/sharedStrings.xml");
    const sharedStrings: string[] = [];
    if (sharedStringsXml) {
      const xmlStr = sharedStringsXml.toString("utf8");
      const siMatches = xmlStr.match(/<si[\s\S]*?<\/si>/g) || [];
      for (const si of siMatches) {
        const textMatches = si.match(/<t(?:\s+[^>]*)?>([\s\S]*?)<\/t>/g) || [];
        const text = textMatches
          .map(t => t.replace(/<t(?:\s+[^>]*)?>/, "").replace(/<\/t>/, ""))
          .join("")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        sharedStrings.push(text);
      }
    }

    const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8") || "";
    const relsXml = entries.get("xl/_rels/workbook.xml.rels")?.toString("utf8") || "";

    const relMap = new Map<string, string>();
    const relMatches = relsXml.match(/<Relationship\s+[^>]*\/>/g) || [];
    for (const rel of relMatches) {
      const idMatch = rel.match(/Id="([^"]+)"/);
      const targetMatch = rel.match(/Target="([^"]+)"/);
      if (idMatch && targetMatch) {
        relMap.set(idMatch[1], targetMatch[1]);
      }
    }

    const sheetMap = new Map<string, Record<string, string>[]>();
    const sheetMatches = workbookXml.match(/<sheet\s+[^>]*\/>/g) || [];
    for (const s of sheetMatches) {
      const nameMatch = s.match(/name="([^"]+)"/);
      const rIdMatch = s.match(/r:id="([^"]+)"/);
      if (!nameMatch || !rIdMatch) continue;
      const sheetName = nameMatch[1];
      let target = relMap.get(rIdMatch[1]) || "";
      if (!target.startsWith("xl/")) target = "xl/" + target;

      const sheetXml = entries.get(target)?.toString("utf8");
      if (!sheetXml) continue;

      const rows = parseSheetRows(sheetXml, sharedStrings);
      sheetMap.set(sheetName, rows);
    }

    return {
      bookings: sheetMap.get("Bookings") || [],
      drivers: sheetMap.get("Drivers") || [],
      workflow: sheetMap.get("WorkflowState") || [],
      driverFlow: sheetMap.get("DriverFlow") || [],
      payments: sheetMap.get("Payments") || [],
      signatures: sheetMap.get("Signatures") || [],
      evidence: sheetMap.get("Evidence") || [],
      photos: sheetMap.get("Photos") || [],
      activity: sheetMap.get("ActivityLog") || [],
      processedEvents: sheetMap.get("ProcessedEvents") || [],
      exceptions: sheetMap.get("ExceptionReport") || [],
      settings: sheetMap.get("Settings") || [],
      checkIn: sheetMap.get("StorageCheckIn") || [],
      checkOut: sheetMap.get("StorageCheckOut") || [],
      parking: sheetMap.get("ParkingLiability") || [],
      liability: sheetMap.get("LiabilityReport") || [],
      pendingSignatures: sheetMap.get("PendingSignatures") || [],
      scenarioProgress: sheetMap.get("ScenarioProgress") || [],
      fetchedAt: new Date().toISOString(),
      durationMs: 5,
      source: "fallback"
    };
  } catch (error) {
    log.warn("failed to parse fallback excel file", { error: String(error) });
    return null;
  }
}

function parseSheetRows(sheetXml: string, sharedStrings: string[]): Record<string, string>[] {
  const rowMatches = sheetXml.match(/<row\s+[^>]*>[\s\S]*?<\/row>/g) || [];
  if (!rowMatches || rowMatches.length < 2) return [];

  const headers: string[] = [];
  const headerRow = rowMatches[0];
  const headerCells = headerRow ? headerRow.match(/<c\s+[^>]*>[\s\S]*?<\/c>/g) || [] : [];
  for (const c of headerCells) {
    const isShared = c.includes('t="s"');
    const vMatch = c.match(/<v>([\s\S]*?)<\/v>/);
    let val = "";
    if (vMatch) {
      val = isShared ? (sharedStrings[Number(vMatch[1])] || "") : vMatch[1];
    }
    headers.push(val.trim());
  }

  const result: Record<string, string>[] = [];
  for (let i = 1; i < rowMatches.length; i++) {
    const rowObj: Record<string, string> = {};
    const rowContent = rowMatches[i];
    const cells = rowContent ? rowContent.match(/<c\s+[^>]*>[\s\S]*?<\/c>/g) || [] : [];
    for (const c of cells) {
      const rMatch = c.match(/r="([A-Z]+)(\d+)"/);
      if (!rMatch) continue;
      const colLetter = rMatch[1];
      const colIndex = letterToColIndex(colLetter);
      const header = headers[colIndex];
      if (!header) continue;

      const isShared = c.includes('t="s"');
      const vMatch = c.match(/<v>([\s\S]*?)<\/v>/);
      let val = "";
      if (vMatch) {
        val = isShared ? (sharedStrings[Number(vMatch[1])] || "") : vMatch[1];
      }
      rowObj[header] = val;
    }
    result.push(rowObj);
  }

  return result;
}

function letterToColIndex(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    index = index * 26 + (letters.charCodeAt(i) - 64);
  }
  return index - 1;
}

function parseZipEntries(buffer: Buffer): Map<string, Buffer> {
  const map = new Map<string, Buffer>();

  // Find End of Central Directory record (signature: 0x06054b50)
  let eocdOffset = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return map;

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

  let curOffset = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    const sig = buffer.readUInt32LE(curOffset);
    if (sig !== 0x02014b50) break; // Central directory header

    const method = buffer.readUInt16LE(curOffset + 10);
    const compressedSize = buffer.readUInt32LE(curOffset + 20);
    const nameLen = buffer.readUInt16LE(curOffset + 28);
    const extraLen = buffer.readUInt16LE(curOffset + 30);
    const commentLen = buffer.readUInt16LE(curOffset + 32);
    const localHeaderOffset = buffer.readUInt32LE(curOffset + 42);

    const name = buffer.toString("utf8", curOffset + 46, curOffset + 46 + nameLen);

    // Read local header to get exact data offset
    const localNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataOffset = localHeaderOffset + 30 + localNameLen + localExtraLen;

    const compressedData = buffer.subarray(dataOffset, dataOffset + compressedSize);
    let uncompressedData: Buffer;
    if (method === 0) {
      uncompressedData = compressedData;
    } else if (method === 8) {
      uncompressedData = zlib.inflateRawSync(compressedData);
    } else {
      uncompressedData = Buffer.alloc(0);
    }

    map.set(name, uncompressedData);
    curOffset += 46 + nameLen + extraLen + commentLen;
  }

  return map;
}

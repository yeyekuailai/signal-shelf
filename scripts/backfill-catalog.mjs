import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);
const root = path.resolve(new URL("..", import.meta.url).pathname);
const ytDlp = process.env.YT_DLP_BIN || "yt-dlp";
const start = process.env.ARCHIVE_START || "20260101";
const end = process.env.ARCHIVE_END || "20261108";
const concurrency = Number(process.env.ARCHIVE_CONCURRENCY || 3);
const playlistEnd = process.env.ARCHIVE_PLAYLIST_END || "2500";
const perChannelCap = Number(process.env.ARCHIVE_PER_CHANNEL_CAP || 365);
const catalogOutput = process.env.CATALOG_OUTPUT || path.join(root, "assets", "data", "catalog-data.js");
const statsOutput = process.env.STATS_OUTPUT || path.join(root, "work", "catalog-stats.json");
function shiftCompactDate(value, days) {
  const date = new Date(`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0,10).replaceAll("-", "");
}
const shortlistStart = shiftCompactDate(start, -45);
const shortlistEnd = shiftCompactDate(end, 45);

const channels = [
  ["ai", "3Blue1Brown", "https://www.youtube.com/@3blue1brown/videos"],
  ["ai", "Dwarkesh Patel", "https://www.youtube.com/@DwarkeshPatel/videos"],
  ["ai", "Andrej Karpathy", "https://www.youtube.com/@AndrejKarpathy/videos"],
  ["ai", "Lex Fridman", "https://www.youtube.com/@lexfridman/videos"],
  ["ai", "Cleo Abram", "https://www.youtube.com/@CleoAbram/videos"],
  ["ai", "Matthew Berman", "https://www.youtube.com/@matthew_berman/videos"],
  ["ai", "Wes Roth", "https://www.youtube.com/@WesRoth/videos"],
  ["finance", "Aswath Damodaran", "https://www.youtube.com/@AswathDamodaranonValuation/videos"],
  ["finance", "Wall Street Millennial", "https://www.youtube.com/@WallStreetMillennial/videos"],
  ["finance", "Modern MBA", "https://www.youtube.com/@ModernMBA/videos"],
  ["finance", "Company Man", "https://www.youtube.com/@companyman114/videos"],
  ["finance", "Bloomberg Originals", "https://www.youtube.com/@business/videos"],
  ["finance", "Business Insider", "https://www.youtube.com/@BusinessInsider/videos"],
  ["finance", "CNBC Make It", "https://www.youtube.com/@CNBCMakeIt/videos"],
  ["supply", "CNBC", "https://www.youtube.com/@CNBC/videos"],
  ["supply", "WSJ", "https://www.youtube.com/@wsj/videos"],
  ["supply", "Wendover Productions", "https://www.youtube.com/@Wendoverproductions/videos"],
  ["supply", "Half as Interesting", "https://www.youtube.com/@halfasinteresting/videos"]
];

const readyIds = new Set(["u15N3l4RT80", "l6DKRf-fAAM", "cd1xrO2q9HU", "p1LHISDb6Zk", "ZYsP8qM6bPE", "xNcU_JRaes0"]);

async function fetchChannel([category, channel, url]) {
  let shortlistStdout = "";
  try {
    ({ stdout: shortlistStdout } = await execFileAsync(ytDlp, [
      "--flat-playlist", "--no-warnings", "--extractor-args", "youtubetab:approximate_date",
      "--playlist-end", playlistEnd,
      "--print", "%(.{id,title,upload_date,view_count,webpage_url})j", url
    ], { maxBuffer: 1024 * 1024 * 20 }));
  } catch (error) {
    shortlistStdout = error.stdout || "";
  }
  const channelEntries = shortlistStdout.split("\n").filter(Boolean).map(line => JSON.parse(line));
  const candidates = [];
  let olderRun = 0;
  for (const item of channelEntries) {
    const date = item.upload_date || "";
    if (date && date < shortlistStart) olderRun += 1;
    else olderRun = 0;
    if (!date || (date >= shortlistStart && date < shortlistEnd)) candidates.push(item);
    if (olderRun >= 100) break;
  }
  const fetchLimit = candidates.length > perChannelCap ? perChannelCap + 35 : candidates.length;
  const selected = candidates.sort((a,b)=>(b.view_count||0)-(a.view_count||0)).slice(0, fetchLimit);
  if (!selected.length) return [];
  let stdout = "";
  try {
    ({ stdout } = await execFileAsync(ytDlp, [
      "--skip-download", "--no-warnings",
      "--print", "%(.{id,title,upload_date,view_count,duration,webpage_url,thumbnail})j",
      ...selected.map(item => item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`)
    ], { maxBuffer: 1024 * 1024 * 50 }));
  } catch (error) {
    stdout = error.stdout || "";
    if (!stdout.trim()) throw error;
  }
  return stdout.split("\n").filter(Boolean).map(line => {
    const item = JSON.parse(line);
    return {
      id: item.id,
      category,
      channel,
      title: item.title,
      sourcePublished: item.upload_date ? `${item.upload_date.slice(0,4)}-${item.upload_date.slice(4,6)}-${item.upload_date.slice(6,8)}` : null,
      views: item.view_count || 0,
      duration: item.duration || 0,
      url: item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`,
      thumbnail: item.thumbnail || null,
      summaryStatus: readyIds.has(item.id) ? "ready" : "pending"
    };
  }).filter(item => item.sourcePublished && item.sourcePublished.replaceAll("-","") >= start && item.sourcePublished.replaceAll("-","") < end)
    .sort((a,b)=>b.views-a.views).slice(0, perChannelCap);
}

const queue = [...channels];
const results = [];
async function worker() {
  while (queue.length) {
    const config = queue.shift();
    try {
      const videos = await fetchChannel(config);
      results.push(...videos);
      process.stderr.write(`${config[1]}: ${videos.length}\n`);
    } catch (error) {
      process.stderr.write(`${config[1]}: ERROR ${error.message}\n`);
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, worker));
results.sort((a, b) => (b.sourcePublished || "").localeCompare(a.sourcePublished || "") || b.views - a.views);
const byDate = Object.groupBy(results, item => item.sourcePublished || "unknown");
const stats = {
  generatedAt: new Date().toISOString(), start, end,
  channels: channels.length, perChannelCap,
  videos: results.length,
  ready: results.filter(item => item.summaryStatus === "ready").length,
  pending: results.filter(item => item.summaryStatus === "pending").length,
  dates: Object.keys(byDate).filter(date => date !== "unknown").length,
  totalDurationSeconds: results.reduce((sum, item) => sum + item.duration, 0)
};
await mkdir(path.dirname(catalogOutput), { recursive: true });
await mkdir(path.dirname(statsOutput), { recursive: true });
await writeFile(catalogOutput, `window.SIGNAL_SHELF_CATALOG=${JSON.stringify({ stats, videos: results })};\n`);
await writeFile(statsOutput, JSON.stringify({ stats, perChannel: Object.fromEntries(channels.map(([, name]) => [name, results.filter(item => item.channel === name).length])) }, null, 2));
process.stdout.write(`${JSON.stringify(stats)}\n`);

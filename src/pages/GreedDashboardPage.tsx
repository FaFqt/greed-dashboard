import { useController } from "@/contexts/controller";
import { NETWORKS } from "@/utils/networkConfig";
import { ellipseAddress, formatAmount } from "@/utils/utils";
import LaunchIcon from "@mui/icons-material/Launch";
import LeaderboardIcon from "@mui/icons-material/Leaderboard";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import VisibilityIcon from "@mui/icons-material/Visibility";
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
} from "@mui/material";
import { useAccount } from "@starknet-react/core";
import { useGameTokens } from "metagame-sdk/sql";
import { type ReactNode, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { addAddressPadding } from "starknet";
import { useNavigate } from "react-router-dom";

type ToriiRow = Record<string, string>;

interface TimelinePoint {
  amount: number;
  cumulative: number;
  executedAt: string;
  label: string;
}

const GREED_CONTRACT = addAddressPadding(
  "0x046db77f066f1bec5ae53d2cf3686a262f308eb904e6b426251bcdf3a6bf34f0"
);
const FEE_CONTRACT = addAddressPadding(
  "0x0248f76e72088853c3fe96cad8f7f075c9e514b862a6e9a3d5957ea5522ebb6d"
);
const SURVIVOR_TOKEN = addAddressPadding(
  NETWORKS.SN_MAIN.paymentTokens.find((token) => token.name === "SURVIVOR")
    ?.address || ""
);
const GREED_SETTINGS_ID = 1;

function toTokenAmount(raw: string, decimals: number = 18) {
  const value = BigInt(raw || "0x0");
  const base = 10n ** BigInt(decimals);
  const whole = Number(value / base);
  const fractionBase = 10n ** BigInt(Math.max(decimals - 4, 0));
  const fraction = Number((value % base) / fractionBase) / 1e4;
  return whole + fraction;
}

async function queryToriiSql(query: string) {
  const response = await fetch(
    `${NETWORKS.SN_MAIN.torii}/sql?query=${encodeURIComponent(query)}`
  );

  if (!response.ok) {
    throw new Error(`Torii query failed: ${response.status}`);
  }

  return (await response.json()) as ToriiRow[];
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function WalletActionButton() {
  const { isPending, playerName, login, openProfile } = useController();
  const { account, address } = useAccount();

  if (account && address) {
    return (
      <Button
        onClick={openProfile}
        loading={!playerName}
        startIcon={<SportsEsportsIcon />}
        variant="contained"
        color="secondary"
        sx={styles.walletButton}
      >
        {playerName || ellipseAddress(address, 6, 4)}
      </Button>
    );
  }

  return (
    <Button
      onClick={login}
      loading={isPending}
      startIcon={<SportsEsportsIcon />}
      variant="contained"
      color="secondary"
      sx={styles.walletButton}
    >
      Connect Cartridge
    </Button>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  icon,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Paper elevation={0} sx={styles.sectionCard}>
      <Box sx={styles.sectionHeader}>
        <Box>
          <Typography sx={styles.sectionTitle}>{title}</Typography>
          {subtitle ? <Typography sx={styles.sectionSubtitle}>{subtitle}</Typography> : null}
        </Box>
        {icon ? <Box sx={styles.sectionIcon}>{icon}</Box> : null}
      </Box>
      {children}
    </Paper>
  );
}

export default function GreedDashboardPage() {
  const navigate = useNavigate();
  const { address } = useAccount();
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);

  const leaderboard = useGameTokens({
    limit: 10,
    sortBy: "score",
    sortOrder: "desc",
    mintedByAddress: GREED_CONTRACT,
    gameAddresses: [NETWORKS.SN_MAIN.gameAddress],
    settings_id: GREED_SETTINGS_ID,
  });

  const myGames = useGameTokens({
    owner: address,
    limit: 25,
    sortBy: "score",
    sortOrder: "desc",
    mintedByAddress: GREED_CONTRACT,
    gameAddresses: [NETWORKS.SN_MAIN.gameAddress],
    settings_id: GREED_SETTINGS_ID,
  });

  useEffect(() => {
    let cancelled = false;

    async function loadTimeline() {
      if (!address) {
        setTimeline([]);
        setTimelineError(null);
        return;
      }

      try {
        setTimelineLoading(true);
        setTimelineError(null);

        const wallet = addAddressPadding(address);
        const rows = await queryToriiSql(
          `SELECT from_address, to_address, amount, executed_at
           FROM token_transfers
           WHERE contract_address = "${SURVIVOR_TOKEN}"
           AND (
             (from_address = "${wallet}" AND (to_address = "${GREED_CONTRACT}" OR to_address = "${FEE_CONTRACT}"))
             OR
             (to_address = "${wallet}" AND from_address = "${GREED_CONTRACT}")
           )
           ORDER BY executed_at ASC
           LIMIT 1000`
        );

        if (cancelled) {
          return;
        }

        const grouped = rows.reduce((accumulator, row) => {
          const key = row.executed_at;
          const amount = toTokenAmount(row.amount);
          const delta =
            row.to_address === wallet
              ? amount
              : row.to_address === GREED_CONTRACT || row.to_address === FEE_CONTRACT
                ? -amount
                : 0;

          const current = accumulator.get(key) || {
            amount: 0,
            executedAt: row.executed_at,
            label: delta > 0 ? "Reward Claimed" : "Run Started",
          };

          current.amount += delta;
          current.label = current.amount > 0 ? "Reward Claimed" : "Run Started";
          accumulator.set(key, current);
          return accumulator;
        }, new Map<string, Omit<TimelinePoint, "cumulative">>());

        let cumulative = 0;
        const nextTimeline = Array.from(grouped.values()).map((point) => {
          cumulative += point.amount;
          return {
            ...point,
            cumulative,
          };
        });

        setTimeline(nextTimeline);
      } catch {
        if (!cancelled) {
          setTimelineError("Unable to load wallet P&L history.");
        }
      } finally {
        if (!cancelled) {
          setTimelineLoading(false);
        }
      }
    }

    loadTimeline();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const totalStaked = timeline
    .filter((point) => point.amount < 0)
    .reduce((sum, point) => sum + Math.abs(point.amount), 0);
  const totalClaimed = timeline
    .filter((point) => point.amount > 0)
    .reduce((sum, point) => sum + point.amount, 0);
  const realizedNet = timeline.length > 0 ? timeline[timeline.length - 1].cumulative : 0;
  const realizedRoi = totalStaked > 0 ? (realizedNet / totalStaked) * 100 : 0;
  const myBestScore = Math.max(...((myGames.games || []).map((game: any) => game.score || 0)), 0);
  const averageScore =
    (myGames.games || []).length > 0
      ? (myGames.games || []).reduce((sum: number, game: any) => sum + (game.score || 0), 0) /
        myGames.games.length
      : 0;

  return (
    <Box sx={styles.page}>
      <Box sx={styles.backdrop} />
      <Box sx={styles.scrollArea}>
        <Box sx={styles.shell}>
          <Box sx={styles.hero}>
            <Box>
              <Typography sx={styles.eyebrow}>Death Mountain</Typography>
              <Typography sx={styles.title}>Greed Dashboard</Typography>
              <Typography sx={styles.subtitle}>
                Track Greed runs, realized wallet P&amp;L, and leaderboard momentum.
              </Typography>
            </Box>

            <Box sx={styles.heroActions}>
              <WalletActionButton />
              <Button
                component="a"
                href="https://www.deathmountain.gg/greed"
                target="_blank"
                rel="noreferrer"
                variant="outlined"
                startIcon={<LaunchIcon />}
                sx={styles.linkButton}
              >
                Play Live
              </Button>
            </Box>
          </Box>

          <Box sx={styles.contentGrid}>
            <SectionCard
              title="Profit & Loss"
              subtitle="Wallet-realized P&L from Greed transfers"
              icon={<ShowChartIcon />}
            >
              <Box sx={styles.pnlSummary}>
                <Box sx={styles.pnlChip}>
                  <Typography sx={styles.pnlLabel}>Net</Typography>
                  <Typography
                    sx={{
                      ...styles.pnlValue,
                      color: realizedNet >= 0 ? "#8ee28e" : "#ff8b8b",
                    }}
                  >
                    {realizedNet >= 0 ? "+" : ""}
                    {formatAmount(realizedNet)} SURVIVOR
                  </Typography>
                </Box>

                <Box sx={styles.pnlChip}>
                  <Typography sx={styles.pnlLabel}>Staked</Typography>
                  <Typography sx={styles.pnlValue}>
                    {formatAmount(totalStaked)} SURVIVOR
                  </Typography>
                </Box>

                <Box sx={styles.pnlChip}>
                  <Typography sx={styles.pnlLabel}>Claimed</Typography>
                  <Typography sx={styles.pnlValue}>
                    {formatAmount(totalClaimed)} SURVIVOR
                  </Typography>
                </Box>

                <Box sx={styles.pnlChip}>
                  <Typography sx={styles.pnlLabel}>ROI</Typography>
                  <Typography
                    sx={{
                      ...styles.pnlValue,
                      color: realizedRoi >= 0 ? "#8ee28e" : "#ff8b8b",
                    }}
                  >
                    {realizedRoi >= 0 ? "+" : ""}
                    {formatAmount(realizedRoi)}%
                  </Typography>
                </Box>
              </Box>

              <Box sx={styles.chartWrap}>
                {!address ? (
                  <Box sx={styles.emptyState}>
                    <Typography sx={styles.emptyTitle}>Connect your Cartridge wallet</Typography>
                    <Typography sx={styles.emptyBody}>
                      The chart computes realized P&amp;L from your indexed SURVIVOR
                      transfers: minus 10 at run start, then plus claim amount when
                      the Greed pool pays back.
                    </Typography>
                  </Box>
                ) : timelineLoading ? (
                  <Box sx={styles.loaderState}>
                    <CircularProgress size={24} color="secondary" />
                  </Box>
                ) : timeline.length === 0 ? (
                  <Box sx={styles.emptyState}>
                    <Typography sx={styles.emptyTitle}>No realized Greed transfers yet</Typography>
                    <Typography sx={styles.emptyBody}>
                      Start or claim a Greed run and the P&amp;L curve will appear here.
                    </Typography>
                  </Box>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={timeline}>
                      <defs>
                        <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#edcf33" stopOpacity={0.5} />
                          <stop offset="100%" stopColor="#edcf33" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="rgba(208, 201, 141, 0.12)" vertical={false} />
                      <XAxis
                        dataKey="executedAt"
                        tickFormatter={formatDateLabel}
                        tick={{ fill: "#b5ae78", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tickFormatter={(value) => `${formatAmount(value)}`}
                        tick={{ fill: "#b5ae78", fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                        width={72}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${formatAmount(value)} SURVIVOR`, "Net"]}
                        labelFormatter={(value) => formatDateLabel(String(value))}
                        contentStyle={styles.chartTooltip}
                        itemStyle={{ color: "#edcf33" }}
                        labelStyle={{ color: "#f3e7a5" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="#edcf33"
                        strokeWidth={2}
                        fill="url(#pnlFill)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </Box>

              {timelineError ? <Typography sx={styles.errorText}>{timelineError}</Typography> : null}
            </SectionCard>
          </Box>

          <Box sx={styles.contentGrid}>
            <SectionCard
              title="My Greed Runs"
              subtitle="Connected wallet run history"
              icon={<SportsEsportsIcon />}
            >
              <Box sx={styles.runStatsRow}>
                <Box sx={styles.runStat}>
                  <Typography sx={styles.runStatLabel}>Runs</Typography>
                  <Typography sx={styles.runStatValue}>{(myGames.games || []).length}</Typography>
                </Box>
                <Box sx={styles.runStat}>
                  <Typography sx={styles.runStatLabel}>Best Score</Typography>
                  <Typography sx={styles.runStatValue}>{myBestScore}</Typography>
                </Box>
                <Box sx={styles.runStat}>
                  <Typography sx={styles.runStatLabel}>Average Score</Typography>
                  <Typography sx={styles.runStatValue}>{formatAmount(averageScore)}</Typography>
                </Box>
              </Box>

              {!address ? (
                <Box sx={styles.emptyState}>
                  <Typography sx={styles.emptyTitle}>Personal history is wallet-based</Typography>
                  <Typography sx={styles.emptyBody}>
                    Connect your Cartridge wallet to load your indexed Greed runs and
                    watch replays from here.
                  </Typography>
                </Box>
              ) : myGames.loading ? (
                <Box sx={styles.loaderState}>
                  <CircularProgress size={24} color="secondary" />
                </Box>
              ) : (myGames.games || []).length === 0 ? (
                <Box sx={styles.emptyState}>
                  <Typography sx={styles.emptyTitle}>No Greed runs found</Typography>
                  <Typography sx={styles.emptyBody}>
                    This wallet does not have indexed Greed runs yet.
                  </Typography>
                </Box>
              ) : (
                <Box sx={styles.list}>
                  {(myGames.games || []).map((game: any) => (
                    <Box key={game.token_id} sx={styles.listRow}>
                      <Box>
                        <Typography sx={styles.listTitle}>
                          {game.player_name || "Adventurer"}
                        </Typography>
                        <Typography sx={styles.listMeta}>Run #{game.token_id}</Typography>
                      </Box>

                      <Box sx={styles.rowRight}>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography sx={styles.listScore}>{game.score || 0} XP</Typography>
                          <Typography sx={styles.listMeta}>
                            {game.game_over ? "Completed" : "Active / claimable"}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VisibilityIcon />}
                          onClick={() => navigate(`/greed/watch?id=${game.token_id}`)}
                          sx={styles.watchButton}
                        >
                          Watch
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </SectionCard>

            <SectionCard
              title="Leaderboard"
              subtitle="Top indexed Greed runs"
              icon={<LeaderboardIcon />}
            >
              {leaderboard.loading ? (
                <Box sx={styles.loaderState}>
                  <CircularProgress size={24} color="secondary" />
                </Box>
              ) : (
                <Box sx={styles.list}>
                  {(leaderboard.games || []).map((game: any, index: number) => (
                    <Box key={game.token_id} sx={styles.listRow}>
                      <Box sx={styles.rankPill}>{index + 1}</Box>
                      <Box sx={{ flex: 1 }}>
                        <Typography sx={styles.listTitle}>
                          {game.player_name || "Adventurer"}
                        </Typography>
                        <Typography sx={styles.listMeta}>Run #{game.token_id}</Typography>
                      </Box>
                      <Box sx={styles.rowRight}>
                        <Box sx={{ textAlign: "right" }}>
                          <Typography sx={styles.listScore}>{game.score || 0} XP</Typography>
                          <Typography sx={styles.listMeta}>
                            {game.game_over ? "Replay ready" : "Still alive"}
                          </Typography>
                        </Box>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<VisibilityIcon />}
                          onClick={() => navigate(`/greed/watch?id=${game.token_id}`)}
                          sx={styles.watchButton}
                        >
                          Watch
                        </Button>
                      </Box>
                    </Box>
                  ))}
                </Box>
              )}
            </SectionCard>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const styles = {
  page: {
    position: "relative",
    minHeight: "100dvh",
    width: "100%",
    overflow: "hidden",
    background:
      "radial-gradient(circle at top left, rgba(237, 207, 51, 0.12), transparent 35%), radial-gradient(circle at top right, rgba(117, 23, 180, 0.18), transparent 28%), #050505",
  },
  backdrop: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.02) 0%, rgba(0,0,0,0.12) 100%)",
    pointerEvents: "none",
  },
  scrollArea: {
    position: "relative",
    height: "100dvh",
    overflowY: "auto",
    overflowX: "hidden",
  },
  shell: {
    maxWidth: "1280px",
    mx: "auto",
    px: { xs: 2, md: 4 },
    py: { xs: 3, md: 4 },
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  hero: {
    display: "flex",
    flexDirection: { xs: "column", lg: "row" },
    justifyContent: "space-between",
    gap: 2,
    alignItems: { xs: "flex-start", lg: "center" },
    p: { xs: 2.5, md: 3.5 },
    borderRadius: "18px",
    border: "1px solid rgba(208, 201, 141, 0.16)",
    background:
      "linear-gradient(135deg, rgba(18,18,18,0.95), rgba(31,18,34,0.92))",
    boxShadow: "0 16px 48px rgba(0, 0, 0, 0.35)",
  },
  eyebrow: {
    fontSize: "0.82rem",
    letterSpacing: "0.22em",
    textTransform: "uppercase",
    opacity: 0.72,
    mb: 1,
  },
  title: {
    fontSize: { xs: "2.4rem", md: "3.4rem" },
    lineHeight: 0.95,
    letterSpacing: "0.03em",
    mb: 1.5,
  },
  subtitle: {
    maxWidth: "740px",
    fontSize: { xs: "0.98rem", md: "1.06rem" },
    lineHeight: 1.7,
    color: "rgba(208, 201, 141, 0.72)",
  },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 1.25,
    alignItems: "center",
  },
  walletButton: {
    minWidth: "180px",
    height: "44px",
    px: 2,
    color: "#111111",
    "& .MuiButton-startIcon": {
      color: "#111111",
    },
  },
  linkButton: {
    minWidth: "132px",
    height: "44px",
    borderColor: "rgba(208, 201, 141, 0.24)",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 2,
  },
  sectionCard: {
    p: { xs: 2, md: 2.5 },
    borderRadius: "18px",
    border: "1px solid rgba(208, 201, 141, 0.12)",
    background: "rgba(12, 12, 12, 0.92)",
  },
  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 2,
    mb: 2,
  },
  sectionTitle: {
    fontSize: "1.35rem",
    lineHeight: 1,
    mb: 0.6,
  },
  sectionSubtitle: {
    fontSize: "0.9rem",
    color: "rgba(208, 201, 141, 0.58)",
  },
  sectionIcon: {
    color: "#edcf33",
    opacity: 0.9,
  },
  pnlSummary: {
    display: "grid",
    gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" },
    gap: 1.25,
    mb: 2,
  },
  pnlChip: {
    p: 1.5,
    borderRadius: "14px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(208, 201, 141, 0.08)",
  },
  pnlLabel: {
    fontSize: "0.74rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "rgba(208, 201, 141, 0.56)",
    mb: 0.6,
  },
  pnlValue: {
    fontSize: "1.15rem",
  },
  chartWrap: {
    minHeight: "300px",
  },
  chartTooltip: {
    background: "rgba(8, 8, 8, 0.94)",
    border: "1px solid rgba(208, 201, 141, 0.18)",
    borderRadius: "10px",
  },
  emptyState: {
    minHeight: "220px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    gap: 1,
    borderRadius: "14px",
    border: "1px dashed rgba(208, 201, 141, 0.18)",
    px: 2,
    py: 3,
  },
  emptyTitle: {
    fontSize: "1.08rem",
  },
  emptyBody: {
    color: "rgba(208, 201, 141, 0.62)",
    lineHeight: 1.7,
  },
  loaderState: {
    minHeight: "220px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  runStatsRow: {
    display: "grid",
    gridTemplateColumns: { xs: "repeat(3, minmax(0, 1fr))" },
    gap: 1.25,
    mb: 2,
  },
  runStat: {
    p: 1.4,
    borderRadius: "14px",
    background: "rgba(255, 255, 255, 0.02)",
  },
  runStatLabel: {
    fontSize: "0.72rem",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    color: "rgba(208, 201, 141, 0.56)",
    mb: 0.55,
  },
  runStatValue: {
    fontSize: "1.18rem",
  },
  list: {
    display: "flex",
    flexDirection: "column",
    gap: 1,
  },
  listRow: {
    display: "flex",
    alignItems: "center",
    gap: 1.25,
    justifyContent: "space-between",
    p: 1.4,
    borderRadius: "14px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(208, 201, 141, 0.06)",
  },
  rankPill: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#111",
    background: "#edcf33",
    fontSize: "0.88rem",
    flexShrink: 0,
  },
  listTitle: {
    fontSize: "1rem",
    mb: 0.35,
  },
  listMeta: {
    fontSize: "0.8rem",
    color: "rgba(208, 201, 141, 0.54)",
  },
  listScore: {
    fontSize: "1rem",
    color: "#f3e7a5",
    mb: 0.35,
  },
  rowRight: {
    display: "flex",
    alignItems: "center",
    gap: 1.25,
    flexShrink: 0,
  },
  watchButton: {
    minWidth: "96px",
    borderColor: "rgba(208, 201, 141, 0.18)",
  },
  errorText: {
    color: "#ff8b8b",
    fontSize: "0.92rem",
  },
};

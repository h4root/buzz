import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowRight, Link2, Plus, Settings2, Trash2 } from "lucide-react";
import * as React from "react";

import { ThemeGrainientBackground } from "@/app/ThemeGrainientBackground";
import type { Community } from "@/features/communities/types";
import { useCommunityIcons } from "@/features/communities/useCommunityIcons";
import { useElementWidth } from "@/shared/hooks/use-mobile";
import { getInitials } from "@/shared/lib/initials";
import { Button } from "@/shared/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { StartupWindowDragRegion } from "@/shared/ui/StartupWindowDragRegion";

const CREATE_COMMUNITY_URL = "https://app.builderlab.xyz/signup?returnTo=/buzz";

// Pointy-top hexagon: flat vertical sides (so hexes in a row touch along their
// edges) and points at top/bottom (so alternating rows nest into each other).
const HEX_CLIP_PATH =
  "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)";

// Pointy-top geometry, as ratios of the hex width W.
//   height   = W / 0.866   (≈ 1.1547·W)
//   row nest = rows overlap vertically by 1/4 of the hex height.
const HEX_ASPECT = 0.866; // width / height
const ROW_OVERLAP = 0.2887; // 0.25 · (1 / 0.866) — negative margin between rows

/** Pick a hex width + column cap that keeps regular hexagons at any width. */
function honeycombLayout(containerWidth: number): {
  hexWidth: number;
  maxColumns: number;
} {
  if (containerWidth >= 860) return { hexWidth: 176, maxColumns: 4 };
  if (containerWidth >= 640) return { hexWidth: 156, maxColumns: 4 };
  if (containerWidth >= 440) return { hexWidth: 140, maxColumns: 3 };
  return { hexWidth: 118, maxColumns: 2 };
}

/** Split items into honeycomb rows given how many fit per row. */
function chunkRows<T>(items: T[], perRow: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += perRow) {
    rows.push(items.slice(i, i + perRow));
  }
  return rows;
}

/** Shared shell: a fixed-width regular hexagon with a hairline edge + fill. */
function HexShell({
  children,
  edgeClassName,
  fillClassName,
  width,
}: {
  children: React.ReactNode;
  edgeClassName: string;
  fillClassName: string;
  width: number;
}) {
  return (
    <>
      <span
        aria-hidden="true"
        className={edgeClassName}
        style={{ clipPath: HEX_CLIP_PATH }}
      />
      <span
        className={fillClassName}
        style={{ clipPath: HEX_CLIP_PATH, padding: `0 ${width * 0.1}px` }}
      >
        {children}
      </span>
    </>
  );
}

function CommunityHex({
  community,
  iconUrl,
  onOpen,
  onRemove,
  width,
}: {
  community: Community;
  iconUrl: string | null;
  onOpen: () => void;
  onRemove: () => void;
  width: number;
}) {
  return (
    <ContextMenu modal={false}>
      <ContextMenuTrigger asChild>
        <button
          aria-label={`Open ${community.name}`}
          className="group relative aspect-[0.866] shrink-0 outline-hidden drop-shadow-[0_8px_16px_rgba(15,18,25,0.16)] transition-transform duration-300 ease-out hover:-translate-y-1.5 focus-visible:-translate-y-1.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          data-testid={`community-home-community-${community.id}`}
          onClick={onOpen}
          style={{ width }}
          type="button"
        >
          <HexShell
            edgeClassName="absolute inset-0 bg-foreground/25 transition-colors duration-300 ease-out group-hover:bg-primary/70 group-focus-visible:bg-primary/80"
            fillClassName="absolute inset-[1.5px] flex flex-col items-center justify-center overflow-hidden bg-card text-card-foreground transition-colors duration-300 ease-out group-hover:bg-card"
            width={width}
          >
            <span className="absolute inset-0 bg-[radial-gradient(circle_at_38%_20%,hsl(var(--primary)/0.14),transparent_62%)]" />
            <span className="relative flex aspect-square w-[34%] items-center justify-center overflow-hidden rounded-[28%] bg-primary/15 text-lg font-semibold text-primary ring-1 ring-primary/20 transition-transform duration-300 ease-out group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100">
              {iconUrl ? (
                <img
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  src={iconUrl}
                />
              ) : (
                getInitials(community.name) || "🐝"
              )}
            </span>
            <span className="relative mt-2.5 max-w-full truncate text-sm font-semibold">
              {community.name}
            </span>
            <span className="relative mt-1 flex items-center gap-1 text-2xs font-medium text-muted-foreground opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100">
              Enter <ArrowRight className="h-3 w-3" />
            </span>
          </HexShell>
        </button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onOpen}>
          <ArrowRight className="h-4 w-4" />
          Open community
        </ContextMenuItem>
        <ContextMenuItem
          onClick={() => void navigator.clipboard.writeText(community.relayUrl)}
        >
          <Link2 className="h-4 w-4" />
          Copy relay URL
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
          Remove from Buzz
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function ActionHex({
  label,
  detail,
  icon,
  onClick,
  testId,
  width,
}: {
  label: string;
  detail: string;
  icon: React.ReactNode;
  onClick: () => void;
  testId: string;
  width: number;
}) {
  return (
    <button
      className="group relative aspect-[0.866] shrink-0 outline-hidden transition-transform duration-300 ease-out hover:-translate-y-1.5 focus-visible:-translate-y-1.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
      data-testid={testId}
      onClick={onClick}
      style={{ width }}
      type="button"
    >
      <HexShell
        edgeClassName="absolute inset-0 bg-primary/30 transition-colors duration-300 ease-out group-hover:bg-primary/50 group-focus-visible:bg-primary/60"
        fillClassName="absolute inset-[1.5px] flex flex-col items-center justify-center bg-background/70 text-foreground backdrop-blur-xl transition-colors duration-300 ease-out group-hover:bg-primary/[0.06]"
        width={width}
      >
        <span className="flex aspect-square w-[30%] items-center justify-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30 transition-all duration-300 ease-out group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground motion-reduce:transition-none motion-reduce:group-hover:scale-100">
          {icon}
        </span>
        <span className="mt-2.5 text-sm font-semibold">{label}</span>
        <span className="mt-1 text-2xs font-medium text-muted-foreground">
          {detail}
        </span>
      </HexShell>
    </button>
  );
}

export function CommunityHome({
  communities,
  onOpenCommunity,
  onJoinCommunity,
  onRemoveCommunity,
  onBackToMachineConfig,
}: {
  communities: Community[];
  onOpenCommunity: (id: string) => void;
  onJoinCommunity: () => void;
  onRemoveCommunity: (id: string) => void;
  onBackToMachineConfig: () => void;
}) {
  const iconsByCommunity = useCommunityIcons(communities);
  const [communityToRemove, setCommunityToRemove] =
    React.useState<Community | null>(null);
  const [gridRef, gridWidth] = useElementWidth<HTMLDivElement>();

  const { hexWidth, maxColumns } = honeycombLayout(gridWidth);
  // How many hexes fit per row, leaving room for the half-hex stagger.
  const tileCount = communities.length + 2;
  const measuredColumns =
    gridWidth > 0
      ? Math.floor((gridWidth - hexWidth / 2) / hexWidth)
      : maxColumns;
  const columnCap = Math.max(1, Math.min(maxColumns, measuredColumns));
  // Balance the last row: e.g. 5 tiles in a 4-wide comb becomes 3+2, not 4+1.
  const rowCount = Math.ceil(tileCount / columnCap);
  const perRow = Math.max(1, Math.ceil(tileCount / rowCount));

  // Build the honeycomb: community tiles first, then the additive actions.
  // Each tile carries a stable key so rows can be keyed by content, not index.
  const tiles: { key: string; node: React.ReactNode }[] = [
    ...communities.map((community) => ({
      key: community.id,
      node: (
        <CommunityHex
          community={community}
          iconUrl={iconsByCommunity[community.id] ?? null}
          key={community.id}
          onOpen={() => onOpenCommunity(community.id)}
          onRemove={() => setCommunityToRemove(community)}
          width={hexWidth}
        />
      ),
    })),
    {
      key: "__join",
      node: (
        <ActionHex
          detail="Use a relay URL"
          icon={<Plus className="h-6 w-6" />}
          key="__join"
          label="Join a community"
          onClick={onJoinCommunity}
          testId="community-home-join"
          width={hexWidth}
        />
      ),
    },
    {
      key: "__create",
      node: (
        <ActionHex
          detail="Start something new"
          icon={<span className="text-xl leading-none">✦</span>}
          key="__create"
          label="Create a community"
          onClick={() => void openUrl(CREATE_COMMUNITY_URL)}
          testId="community-home-create"
          width={hexWidth}
        />
      ),
    },
  ];

  const rows = chunkRows(tiles, perRow);
  const hasStagger = rows.length > 1;

  return (
    <main
      className="relative min-h-dvh overflow-y-auto bg-background text-foreground"
      data-testid="community-home"
    >
      <StartupWindowDragRegion />
      <ThemeGrainientBackground />
      <div className="pointer-events-none absolute inset-0 bg-background/35 backdrop-blur-3xl" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-8 pb-16 pt-20 sm:px-12 lg:px-16">
        <header className="flex items-start justify-between gap-8">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Buzz communities
            </p>
            <h1 className="mt-3 text-balance text-title font-normal">
              Where do you want to go?
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              Your communities, all in one place. Choose one to enter or make a
              new space for your people.
            </p>
          </div>
          <Button
            aria-label="Identity settings"
            className="mt-1 rounded-full bg-background/50 backdrop-blur-md"
            onClick={onBackToMachineConfig}
            size="icon"
            type="button"
            variant="outline"
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </header>

        <section
          aria-label="Communities"
          className="mt-14 flex flex-col items-center"
          ref={gridRef}
        >
          {rows.map((row, rowIndex) => {
            const isOffsetRow = rowIndex % 2 === 1;
            // Nest each row up into the previous one and stagger alternating
            // rows by half a hex so the pointed edges interlock.
            const translateX = hasStagger
              ? isOffsetRow
                ? hexWidth / 4
                : -hexWidth / 4
              : 0;
            return (
              <div
                className="flex"
                key={row.map((tile) => tile.key).join("|")}
                style={{
                  marginTop:
                    rowIndex === 0 ? 0 : -(hexWidth / HEX_ASPECT) * ROW_OVERLAP,
                  transform: `translateX(${translateX}px)`,
                }}
              >
                {row.map((tile) => tile.node)}
              </div>
            );
          })}
        </section>

        {communities.length === 0 ? (
          <p className="mx-auto mt-16 max-w-md text-center text-sm leading-6 text-muted-foreground">
            This is your community home. It stays available whenever you want a
            neutral place to join, create, or switch communities.
          </p>
        ) : null}
      </div>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) setCommunityToRemove(null);
        }}
        open={communityToRemove !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {communityToRemove?.name ?? "community"} from Buzz?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the saved community from this device. It does not
              delete the community or your membership.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                onClick={() => {
                  if (communityToRemove) {
                    onRemoveCommunity(communityToRemove.id);
                  }
                  setCommunityToRemove(null);
                }}
                type="button"
                variant="destructive"
              >
                Remove community
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

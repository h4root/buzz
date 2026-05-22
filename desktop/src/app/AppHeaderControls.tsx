import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { Button } from "@/shared/ui/button";
import { SidebarTrigger } from "@/shared/ui/sidebar";

type AppHeaderControlsProps = {
  canGoBack: boolean;
  canGoForward: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onOpenSearch: () => void;
};

export function AppHeaderControls({
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onOpenSearch,
}: AppHeaderControlsProps) {
  return (
    <div className="fixed left-[80px] top-[9px] z-50 flex items-center gap-0.5">
      <SidebarTrigger className="h-[22px] w-[22px] text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground" />
      <Button
        aria-label="Go back"
        className="h-[22px] w-[22px] text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
        data-testid="global-back"
        disabled={!canGoBack}
        onClick={onGoBack}
        size="icon"
        variant="ghost"
      >
        <ChevronLeft className="h-3 w-3" />
      </Button>
      <Button
        aria-label="Go forward"
        className="h-[22px] w-[22px] text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
        data-testid="global-forward"
        disabled={!canGoForward}
        onClick={onGoForward}
        size="icon"
        variant="ghost"
      >
        <ChevronRight className="h-3 w-3" />
      </Button>
      <Button
        aria-label="Search Sprout"
        className="h-[22px] w-[22px] text-muted-foreground/70 hover:bg-muted/60 hover:text-foreground"
        data-testid="global-search"
        onClick={onOpenSearch}
        size="icon"
        variant="ghost"
      >
        <Search className="h-3 w-3" />
      </Button>
    </div>
  );
}

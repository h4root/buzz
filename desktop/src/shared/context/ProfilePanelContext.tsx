import * as React from "react";

export type ProfilePanelOpenOptions = {
  tab?: "info" | "runtime" | "channels" | "memories";
};

type ProfilePanelContextValue = {
  openProfilePanel:
    | ((pubkey: string, options?: ProfilePanelOpenOptions) => void)
    | null;
};

const ProfilePanelContext = React.createContext<ProfilePanelContextValue>({
  openProfilePanel: null,
});

export function ProfilePanelProvider({
  children,
  onOpenProfilePanel,
}: {
  children: React.ReactNode;
  onOpenProfilePanel: (
    pubkey: string,
    options?: ProfilePanelOpenOptions,
  ) => void;
}) {
  const value = React.useMemo(
    () => ({
      openProfilePanel: onOpenProfilePanel,
    }),
    [onOpenProfilePanel],
  );

  return (
    <ProfilePanelContext.Provider value={value}>
      {children}
    </ProfilePanelContext.Provider>
  );
}

export function useProfilePanel() {
  return React.useContext(ProfilePanelContext);
}

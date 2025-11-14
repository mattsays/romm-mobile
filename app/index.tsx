import { useRomDownload } from "@/hooks/useRomDownload";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BaseFolderModal } from "../components/BaseFolderModal";
import { CollectionCoverGrid } from "../components/CollectionCoverGrid";
import { DownloadStatusBar } from "../components/DownloadStatusBar";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { useDownload } from "../contexts/DownloadContext";
import { useToast } from "../contexts/ToastContext";
import { useAuthCheck, useLogout } from "../hooks/useAuth";
import { useCollections } from "../hooks/useCollections";
import { usePlatformFolders } from "../hooks/usePlatformFolders";
import { useRomFileSystem } from "../hooks/useRomFileSystem";
import { usePlatforms, useRoms } from "../hooks/useRoms";
import { useStorageAccessFramework } from "../hooks/useStorageAccessFramework";
import { useTranslation } from "../hooks/useTranslation";
import {
  apiClient,
  Platform as ApiPlatform,
  Collection,
  CollectionType,
  Rom,
} from "../services/api";
import { updateService } from "../services/updateService";

const { width } = Dimensions.get("window");

export default function LibraryScreen() {
  const { t } = useTranslation();
  const { platforms, loading, error, fetchPlatforms } = usePlatforms(false); // Don't auto-fetch
  const {
    userCollections,
    generatedCollections,
    loading: collectionsLoading,
    error: collectionsError,
    fetchCollections,
    getCollectionTypeName,
  } = useCollections(false);
  const { recentlyAddedRoms, fetchRecentlyAddedRoms } = useRoms();
  const { user, username, isAuthenticated } = useAuthCheck();
  const { logout, isLoading: isLoggingOut } = useLogout();
  const { showErrorToast, showInfoToast, showSuccessToast } = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [recentRomsLoading, setRecentRomsLoading] = useState(false);
  const { activeDownloads, isRomDownloading, completedDownloads } =
    useDownload();
  const { downloadRom } = useRomDownload();
  const {
    searchPlatformFolder,
    hasBaseFolder,
    canAccessBaseFolder,
    setBaseFolder,
    removeAllPlatformFolders,
  } = usePlatformFolders();
  const { requestDirectoryPermissions } = useStorageAccessFramework();
  const { resetRomsCheck, refreshRomCheck, isRomDownloaded, isCheckingRom } =
    useRomFileSystem();
  const insets = useSafeAreaInsets();
  const [showBaseFolderModal, setShowBaseFolderModal] = useState(false);
  const [baseFolderChecked, setBaseFolderChecked] = useState(false);

  const loadRecentRoms = async (needResetRom: boolean = false) => {
    await fetchRecentlyAddedRoms();
    if (recentlyAddedRoms && recentlyAddedRoms.length > 0) {
      if (needResetRom) {
        resetRomsCheck(recentlyAddedRoms.map((rom) => rom.files[0]));
      }
      await Promise.all(
        recentlyAddedRoms.map(async (rom) => {
          const platformFolder = await searchPlatformFolder({
            name: rom.platform_name,
            slug: rom.platform_slug,
          } as ApiPlatform);
          if (!platformFolder) return;
          refreshRomCheck(rom.files[0], platformFolder);
        })
      );
    }
  };

  // Function for refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        fetchPlatforms(),
        fetchCollections(),
        loadRecentRoms(true),
      ]);

      // Also check for app updates on refresh (Android only)
      checkForAppUpdates();

      console.log("Refresh completed");
      setRefreshing(false);
    } catch (error) {
      console.error("Error during refresh:", error);
    } finally {
      setRefreshing(false);
    }
  };

  // Fetch platforms only after authentication is verified
  useEffect(() => {
    console.log("isAuthenticated:", isAuthenticated);
    if (isAuthenticated) {
      Promise.all([fetchPlatforms(), fetchCollections(), loadRecentRoms(true)]);

      // Check for app updates when entering the library (Android only)
      checkForAppUpdates();
    }
  }, [isAuthenticated]);

  useEffect(() => {
    resetRomsCheck(recentlyAddedRoms.map((rom) => rom.files[0]));
  }, []);

  // Check for base folder when authenticated
  useEffect(() => {
    const checkBaseFolderRequired = async () => {
      if (isAuthenticated && !baseFolderChecked) {
        try {
          const canAccessBase = await canAccessBaseFolder();
          if (!canAccessBase) {
            if (Platform.OS === "android") {
              setShowBaseFolderModal(true);
            } else {
              // Create automatically base folder for iOS
              const folderUri = await requestDirectoryPermissions();

              if (folderUri) {
                await removeAllPlatformFolders();
                await setBaseFolder(folderUri);
              }
            }
          }
        } catch (error) {
          console.error("Error checking base folder:", error);
        } finally {
          setBaseFolderChecked(true);
        }
      }
    };

    checkBaseFolderRequired();
  }, [FileSystem.documentDirectory, canAccessBaseFolder]);

  // // Check filesystem for existing ROMs when recently added ROMs are loaded
  // useEffect(() => {
  //     const checkRecentRomFolders = async () => {
  //         if (recentlyAddedRoms && recentlyAddedRoms.length > 0) {
  //             for (const rom of recentlyAddedRoms) {
  //                 //await refreshRomCheck(rom);
  //             }
  //         }
  //     };
  //     checkRecentRomFolders();
  // }, [recentlyAddedRoms, platformFolders, refreshRomCheck]);

  // Monitor completed downloads to refresh ROM status
  useEffect(() => {
    Promise.all(
      completedDownloads.map((downloadedItem) =>
        refreshRomCheck(downloadedItem.romFile, downloadedItem.platformFolder)
      )
    );
  }, [completedDownloads.length]);

  const handleLogout = async () => {
    Alert.alert(t("logoutAction"), t("confirmLogout"), [
      {
        text: t("cancel"),
        style: "cancel",
      },
      {
        text: t("exit"),
        style: "destructive",
        onPress: async () => {
          try {
            await AsyncStorage.clear();
            await logout();
          } catch (error) {
            console.error("Logout error:", error);
          }
        },
      },
    ]);
  };

  // Show error if API call fails
  useEffect(() => {
    if (error || collectionsError) {
      showErrorToast(t("unableToLoadData"), t("error"));
    }
  }, [error, collectionsError, showErrorToast, t]);

  const handleDownload = async (rom: Rom) => {
    if (!rom) return;

    try {
      await downloadRom(rom, rom.files[0], {
        name: rom.platform_name,
        slug: rom.platform_slug,
      } as ApiPlatform);
    } catch (error: any) {
      console.error("Download error:", error);

      if (error.type === "already_downloaded") {
        showInfoToast(error.message, t("fileAlreadyDownloaded"));
      } else {
        const errorMessage =
          error instanceof Error ? error.message : t("errorDuringDownload");
        showErrorToast(errorMessage, t("downloadError"));
      }
    }
  };

  const handleBaseFolderComplete = () => {
    setShowBaseFolderModal(false);
    setBaseFolderChecked(true);
  };

  function PlatformCard({ platform }: { platform: ApiPlatform }) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        style={[styles.platformCard, focused ? styles.romCardFocused : null]}
        onPress={() => router.push(`/platform/${platform.id}`)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={false}
        isTVSelectable={true}
        focusable={true}
        accessible={true}
      >
        <View style={styles.platformImageContainer}>
          <Image
            source={{
              uri: `${apiClient.baseUrl}/assets/platforms/${platform.slug}.ico`,
            }}
            style={styles.platformImage}
          />
        </View>
        <View style={styles.platformInfo}>
          <Text style={styles.platformName} numberOfLines={1}>
            {platform.name}
          </Text>
          <Text style={styles.gamesCount}>
            {platform.rom_count} {t("games")}
          </Text>
        </View>
      </Pressable>
    );
  }

  function CollectionCard({ collection }: { collection: Collection }) {
    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        style={[styles.collectionCard, focused ? styles.romCardFocused : null]}
        onPress={() =>
          router.push(
            `/collection/${collection.id}?virtual=${collection.is_virtual}`
          )
        }
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={false}
        isTVSelectable={true}
        focusable={true}
        accessible={true}
      >
        <View style={styles.collectionImageContainer}>
          <CollectionCoverGrid
            covers={collection.path_covers_small || []}
            style={styles.collectionImage}
          />
        </View>
        <View style={styles.collectionInfo}>
          <Text style={styles.collectionName} numberOfLines={1}>
            {collection.name}
          </Text>
          <Text style={styles.collectionCount}>
            {collection.rom_count} {t("games")}
          </Text>
        </View>
      </Pressable>
    );
  }

  const RomCard = ({ rom }: { rom: Rom }) => {
    // Helper function to count downloaded versions
    const getDownloadedVersionsCount = () => {
      if (!rom.files || rom.files.length === 0) return 0;
      return rom.files.filter((file) => isRomDownloaded(file)).length;
    };

    // Helper function to check if any version is downloading
    const isAnyVersionDownloading = () => {
      if (!rom.files || rom.files.length === 0) return false;
      return rom.files.some((file) => isRomDownloading(file));
    };

    // Helper function to check if any version is being checked
    const isAnyVersionChecking = () => {
      if (!rom.files || rom.files.length === 0) return false;
      return rom.files.some((file) => isCheckingRom(file));
    };

    const downloadedCount = getDownloadedVersionsCount();
    const totalVersions = rom.files?.length || 0;
    const hasMultipleVersions = totalVersions > 1;
    const anyDownloaded = downloadedCount > 0;
    const anyDownloading = isAnyVersionDownloading();
    const anyChecking = isAnyVersionChecking();
    const allDownloaded =
      downloadedCount === totalVersions && totalVersions > 0;

    const [focused, setFocused] = useState(false);
    return (
      <Pressable
        style={[styles.romCard, focused ? styles.romCardFocused : null]}
        onPress={() => router.push(`/game/${rom.id}`)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        hasTVPreferredFocus={false}
        isTVSelectable={true}
        focusable={true}
        accessible={true}
      >
        <View style={styles.romImageContainer}>
          {rom.url_cover ? (
            <Image source={{ uri: rom.url_cover }} style={styles.romImage} />
          ) : (
            <View style={styles.romPlaceholder}>
              <Ionicons name="game-controller-outline" size={32} color="#666" />
            </View>
          )}

          {/* Status Badges */}
          {anyDownloaded && (
            <View style={styles.completedBadge}>
              <Ionicons name="checkmark-circle" size={24} color="#34C759" />
              {hasMultipleVersions && (
                <Text style={styles.versionCountBadge}>
                  {downloadedCount}/{totalVersions}
                </Text>
              )}
            </View>
          )}
          {anyChecking && !anyDownloaded && (
            <View style={styles.checkingBadge}>
              <ActivityIndicator size={16} color="#FF9500" />
            </View>
          )}
          {anyDownloading && (
            <View style={styles.downloadingBadge}>
              <Ionicons name="download" size={20} color="#FFFFFF" />
            </View>
          )}

          {/* Download Button - Only show if not all versions downloaded and none downloading */}
          {!anyDownloaded && !anyDownloading && (
            <View style={styles.romOverlay}>
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => handleDownload(rom)}
              >
                <Ionicons name="download-outline" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
        <View style={styles.romInfo}>
          <Text style={styles.romName} numberOfLines={2}>
            {rom.name}
          </Text>
          <Text style={styles.romPlatform} numberOfLines={1}>
            {rom.platform_name}
          </Text>
        </View>
      </Pressable>
    );
  };

  // Function to check for app updates (Android only)
  const checkForAppUpdates = async () => {
    if (Platform.OS !== "android") return;

    try {
      // Check if app updates are enabled
      const updatesEnabled = await AsyncStorage.getItem("appUpdatesEnabled");
      const isEnabled =
        updatesEnabled !== null ? JSON.parse(updatesEnabled) : true;

      if (!isEnabled) return;

      // Check for updates silently in the background
      const release = await updateService.checkForUpdates();
      if (release) {
        // Show a toast notification about the available update
        showSuccessToast(t("updateAvailable"), t("settings"));
      }
    } catch (error) {
      // Silent fail for library screen update check
      console.log("Library screen update check failed:", error);
    }
  };

  useEffect(() => {
    checkForAppUpdates();
  }, [isAuthenticated]);

  if (loading && collectionsLoading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>{t("loading")}</Text>
      </View>
    );
  }

  return (
    <ProtectedRoute>
      <View style={styles.container}>
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#5f43b2"]} // Android
              tintColor="#5f43b2" // iOS
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>{t("library")}</Text>
                {username && (
                  <Text style={styles.welcomeText}>
                    {t("welcomeUser", { username })}
                  </Text>
                )}
              </View>
              <View style={styles.headerButtons}>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => router.push("/search")}
                >
                  <Ionicons name="search-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.headerButton,
                    activeDownloads.length > 0 && styles.downloadButtonActive,
                  ]}
                  onPress={() => router.push("/downloads")}
                >
                  <Ionicons name="download-outline" size={24} color="#fff" />
                  {activeDownloads.length > 0 && (
                    <View style={styles.downloadBadge}>
                      <Text style={styles.downloadBadgeText}>
                        {activeDownloads.length}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={() => router.push("/settings")}
                >
                  <Ionicons name="settings-outline" size={24} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.headerButton}
                  onPress={handleLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="log-out-outline" size={24} color="#fff" />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Recent ROMs Section */}
          {recentlyAddedRoms && recentlyAddedRoms.length > 0 && (
            <View style={styles.recentRomsContainer}>
              <Text style={styles.sectionTitle}>{t("recentlyAdded")}</Text>
              {recentRomsLoading ? (
                <View style={styles.emptyContainer}>
                  <ActivityIndicator size="large" color="#5f43b2" />
                </View>
              ) : (
                <FlatList
                  data={recentlyAddedRoms}
                  renderItem={({ item }) => <RomCard rom={item} />}
                  keyExtractor={(item) => item.id.toString()}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.horizontalList}
                />
              )}
            </View>
          )}

          {/* Platforms Grid */}
          <View style={styles.platformsContainer}>
            <Text style={styles.sectionTitle}>{t("platformsSection")}</Text>
            {platforms.length > 0 ? (
              <FlatList
                data={platforms}
                renderItem={({ item }) => {
                  if (item.rom_count > 0) {
                    return <PlatformCard platform={item} />;
                  }
                  return null;
                }}
                keyExtractor={(item) => item.id.toString()}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              />
            ) : (
              !loading && (
                <View style={styles.emptyContainer}>
                  <Ionicons
                    name="game-controller-outline"
                    size={64}
                    color="#666"
                  />
                  <Text style={styles.emptyText}>
                    {t("noPlatformsAvailable")}
                  </Text>
                </View>
              )
            )}
          </View>

          {/* User Collections Section */}
          {userCollections && userCollections.length > 0 && (
            <View style={styles.collectionsContainer}>
              <Text style={styles.sectionTitle}>{t("customCollections")}</Text>
              <FlatList
                data={userCollections}
                renderItem={({ item }) => <CollectionCard collection={item} />}
                keyExtractor={(item) => item.id.toString()}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalList}
              />
            </View>
          )}

          {/* Generated Collections Section */}
          {generatedCollections &&
            Object.keys(generatedCollections).length > 0 && (
              <View style={styles.collectionsContainer}>
                {Object.entries(generatedCollections).map(
                  ([type, collections]) => (
                    <View key={type}>
                      <Text style={styles.sectionTitle}>
                        {getCollectionTypeName(type as CollectionType)}
                      </Text>
                      <FlatList
                        data={collections}
                        renderItem={({ item }) => (
                          <CollectionCard collection={item} />
                        )}
                        keyExtractor={(item) => item.id.toString()}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.horizontalList}
                      />
                    </View>
                  )
                )}
              </View>
            )}

          {/* Bottom padding for download status bar */}
          {activeDownloads.length > 0 && (
            <View
              style={[styles.bottomPadding, { height: 80 + insets.bottom }]}
            />
          )}
        </ScrollView>
        <DownloadStatusBar onPress={() => router.push("/downloads")} />
      </View>
      <BaseFolderModal
        visible={showBaseFolderModal}
        onComplete={handleBaseFolderComplete}
      />
    </ProtectedRoute>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 10,
  },
  content: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  headerLeft: {
    flex: 1,
  },
  headerButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerButton: {
    padding: 10,
    borderRadius: 8,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "bold",
  },
  welcomeText: {
    color: "#ccc",
    fontSize: 14,
    marginTop: 4,
  },
  platformsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  collectionsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  horizontalList: {
    paddingHorizontal: 5,
  },
  platformsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  platformCard: {
    width: 120,
    marginHorizontal: 8,
    marginBottom: 20,
    backgroundColor: "#111",
    borderRadius: 12,
    overflow: "hidden",
  },
  platformImageContainer: {
    position: "relative",
    height: 100,
    backgroundColor: "#333",
  },
  platformImage: {
    width: "100%",
    height: "100%",
    resizeMode: "contain",
  },
  platformInfo: {
    padding: 12,
  },
  platformName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  gamesCount: {
    color: "#999",
    fontSize: 10,
    textAlign: "center",
  },
  collectionCard: {
    width: 140,
    marginHorizontal: 8,
    backgroundColor: "#111",
    borderRadius: 12,
    overflow: "hidden",
  },
  collectionImageContainer: {
    height: 100,
    backgroundColor: "#333",
  },
  collectionImage: {
    width: "100%",
    height: "100%",
  },
  collectionInfo: {
    padding: 12,
  },
  collectionName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  collectionCount: {
    color: "#999",
    fontSize: 10,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    width: "100%",
  },
  emptyText: {
    color: "#666",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
  },
  romsFolderStatus: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginBottom: 10,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  statusText: {
    fontSize: 14,
    flex: 1,
  },
  configureButton: {
    backgroundColor: "#5f43b2",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  configureButtonText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  downloadButtonActive: {
    backgroundColor: "#007AFF",
  },
  downloadBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "#FF3B30",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  downloadBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "bold",
  },
  bottomPadding: {
    height: 80, // Sufficient height to avoid overlap with the download status bar
  },
  romCard: {
    width: 140,
    marginHorizontal: 8,
    backgroundColor: "#111",
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 0,
    borderColor: "transparent",
  },
  romCardFocused: {
    borderWidth: 6,
    borderColor: "#00bfff",
    backgroundColor: "#005fa3",
    shadowColor: "#00bfff",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 8,
  },
  romImageContainer: {
    height: 100,
    backgroundColor: "#333",
    position: "relative",
  },
  romImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  romPlaceholder: {
    width: "100%",
    height: "100%",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#222",
  },
  romInfo: {
    padding: 12,
  },
  romName: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    textAlign: "center",
  },
  romPlatform: {
    color: "#999",
    fontSize: 10,
    textAlign: "center",
  },
  recentRomsContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  romOverlay: {
    position: "absolute",
    bottom: 8,
    right: 8,
  },
  downloadButton: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  downloadButtonDisabled: {
    backgroundColor: "rgba(95, 67, 178, 0.7)",
  },
  completedBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    borderRadius: 15,
    padding: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  versionCountBadge: {
    color: "#34C759",
    fontSize: 10,
    fontWeight: "bold",
    marginLeft: 2,
  },
  checkingBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(255, 149, 0, 0.9)",
    borderRadius: 12,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  downloadingBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(0, 122, 255, 0.9)",
    borderRadius: 12,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
});

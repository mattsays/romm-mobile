import { Ionicons } from "@expo/vector-icons";
import * as SAF from "@joplin/react-native-saf-x";
import * as FileSystem from "expo-file-system";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Platform as RNPlatform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ProtectedRoute } from "../../components/ProtectedRoute";
import { useDownload } from "../../contexts/DownloadContext";
import { useToast } from "../../contexts/ToastContext";
import { usePlatformFolders } from "../../hooks/usePlatformFolders";
import { useRomDownload } from "../../hooks/useRomDownload";
import { useRomFileSystem } from "../../hooks/useRomFileSystem";
import { useStorageAccessFramework } from "../../hooks/useStorageAccessFramework";
import { useTranslation } from "../../hooks/useTranslation";
import { apiClient, Platform, Rom } from "../../services/api";
import { SettingsService } from "../../services/settingsService";

const EJS_SUPPORTED_PLATFORMS: string[] = [
  "3do",
  "amiga",
  "arcade",
  "atari2600",
  "atari5200",
  "atari7800",
  "jaguar",
  "lynx",
  "c64",
  "colecovision",
  "doom",
  "neo-geo-pocket",
  "neo-geo-pocket-color",
  "dos",
  "n64",
  "nes",
  "famicom",
  "nds",
  "gb",
  "gbc",
  "gba",
  "pc-fx",
  "psx",
  "sega32",
  "segacd",
  "gamegear",
  "sms",
  "genesis",
  "saturn",
  "snes",
  "sfam",
  "tg16",
  "virtualboy",
  "wonderswan",
  "wonderswan-color",
];

export default function GameDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { showSuccessToast, showErrorToast, showInfoToast } = useToast();
  const [rom, setRom] = useState<Rom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existingFilePath, setExistingFilePath] = useState<string | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [showVersionSelector, setShowVersionSelector] =
    useState<boolean>(false);
  const [emuJsEnabled, setEmuJsEnabled] = useState<boolean>(true);
  const { downloadRom, isDownloading } = useRomDownload();
  const { getDownloadById, completedDownloads, activeDownloads } =
    useDownload();
  const { searchPlatformFolder, requestPlatformFolder } = usePlatformFolders();
  const { isRomDownloaded, isCheckingRom, refreshRomCheck, resetRomsCheck } =
    useRomFileSystem();
  const { isSafAvailable } = useStorageAccessFramework();

  // Ref per tenere traccia dei download completati già processati
  const processedDownloadsRef = useRef<Set<string>>(new Set());

  const getSelectedFile = () => {
    if (!rom || !rom.files || rom.files.length === 0) return undefined;
    return rom.files[selectedFileIndex] || rom.files[0];
  };

  // Get the current download item for the ROM to access progress
  const getCurrentDownload = () => {
    if (!rom) return null;
    return (
      activeDownloads.find(
        (download) => download.romFile.rom_id === getSelectedFile()?.rom_id
      ) || null
    );
  };

  const currentDownload = getCurrentDownload();
  const downloadProgress = (currentDownload?.progress || 0) / 100; // Progress is 0-100, convert to 0-1 for width percentage

  useEffect(() => {
    if (id) {
      // Reset dei download processati quando cambia la ROM
      processedDownloadsRef.current.clear();
      loadRomDetails();
    }
  }, [id]);

  // Load EmuJS setting on component mount
  useEffect(() => {
    const loadEmuJsSetting = async () => {
      try {
        const enabled = await SettingsService.getEmuJsEnabled();
        setEmuJsEnabled(enabled);
      } catch (error) {
        console.error("Error loading EmuJS setting:", error);
        setEmuJsEnabled(true); // Default to enabled
      }
    };
    loadEmuJsSetting();
  }, []);

  // Listen for completed downloads to refresh ROM check
  useEffect(() => {
    if (rom && completedDownloads.length > 0) {
      const currentRomFile = getSelectedFile();

      if (!currentRomFile) return;

      // Controlla solo i nuovi download completati che non sono stati processati
      const newCompletedDownloads = completedDownloads.filter(
        (download) =>
          download.romFile.rom_id === currentRomFile.rom_id &&
          !processedDownloadsRef.current.has(download.id)
      );

      if (newCompletedDownloads.length > 0) {
        // Marca tutti i nuovi download come processati
        newCompletedDownloads.forEach((download) => {
          processedDownloadsRef.current.add(download.id);
        });

        // Aggiorna lo stato per questa ROM
        const refreshAndUpdate = async () => {
          const platformFolder = await searchPlatformFolder({
            name: rom.platform_name,
            slug: rom.platform_slug,
          } as Platform);

          if (!platformFolder) {
            console.error("No platform folder found for:", rom.platform_name);
            return;
          }

          await refreshRomCheck(currentRomFile, platformFolder);
          await updateExistingFilePath(rom);
        };
        refreshAndUpdate();
      }
    }
  }, [completedDownloads.length, getSelectedFile()?.id]);

  // Force check ROM status when ROM changes
  useEffect(() => {
    if (rom) {
      const checkRomStatus = async () => {
        const platformFolder = await searchPlatformFolder({
          name: rom.platform_name,
          slug: rom.platform_slug,
        } as Platform);
        if (!platformFolder) {
          // Ask for permission to access the platform folder
          await requestPlatformFolder({
            name: rom.platform_name,
            slug: rom.platform_slug,
          } as Platform);
        }
        await refreshRomCheck(getSelectedFile()!, platformFolder!);
        await updateExistingFilePath(rom);
      };
      checkRomStatus();
    }
  }, [selectedFileIndex, rom?.id]);

  // Update file path when selected version changes
  useEffect(() => {
    if (rom) {
      updateExistingFilePath(rom);
    }
  }, [selectedFileIndex, rom]);

  const loadRomDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const romData = await apiClient.getRomById(parseInt(id), true);
      setRom(romData);
      // Update existing file path when ROM is loaded
      await updateExistingFilePath(romData);
    } catch (error) {
      console.error("Error loading ROM details:", error);
      setError(t("errorLoadingGameDetails"));
    } finally {
      setLoading(false);
    }
  };

  const updateExistingFilePath = async (rom: Rom) => {
    try {
      const selectedFile = getSelectedFile();
      if (!selectedFile) {
        setExistingFilePath(null);
        return;
      }

      console.log(
        "Updating existing file path for ROM file:",
        selectedFile.file_name
      );
      const platformSlug = rom.platform_slug;
      const platformFolder = await searchPlatformFolder({
        name: rom.platform_name,
        slug: rom.platform_slug,
      } as Platform);

      if (!platformFolder) {
        console.log("No platform folder found for:", platformSlug);
        setExistingFilePath(null);
        return;
      }

      console.log("Platform folder found:", platformFolder.folderUri);
      var files: string[];

      if (isSafAvailable()) {
        // Use SAF for Android (non-TV)
        files = (await SAF.listFiles(platformFolder.folderUri)).map(
          (file) => file.name
        );
      } else {
        // Use expo-file-system Directory for Android TV and iOS
        const dir = new FileSystem.Directory(platformFolder.folderUri);
        const fileList = await dir.list();
        files = fileList.map((file) => file.name);
      }
      const fileNameWithoutExtension = selectedFile.file_name.replace(
        /\.[^/.]+$/,
        ""
      );
      // Check if the ROM file exists in the platform folder
      const romExists = files.some(
        (file) => file.replace(/\.[^/.]+$/, "") === fileNameWithoutExtension
      );
      if (romExists) {
        setExistingFilePath(
          platformFolder.folderUri + "/" + fileNameWithoutExtension
        );
        return;
      }
      // If no file found, clear the path
      setExistingFilePath(null);
    } catch (error) {
      console.error("Error updating existing file path:", error);
      setExistingFilePath(null);
    }
  };

  const handleBack = () => {
    router.back();
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const handleDownload = async () => {
    if (!rom) return;

    try {
      await downloadRom(rom, getSelectedFile()!, {
        name: rom.platform_name,
        slug: rom.platform_slug,
      } as Platform);
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

  const handleDeleteFile = async (rom: Rom) => {
    const selectedFile = getSelectedFile();
    if (!selectedFile) {
      showErrorToast(t("noFileToDelete"), t("error"));
      return;
    }
    const fileNameWithoutExtension = selectedFile.file_name.replace(
      /\.[^/.]+$/,
      ""
    );
    Alert.alert(
      t("confirmDeletion"),
      t("confirmDeleteFile", { fileName: fileNameWithoutExtension }),
      [
        {
          text: t("cancel"),
          style: "cancel",
        },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => {
            try {
              // Try to delete the file using Storage Access Framework
              const platformFolder = await searchPlatformFolder({
                name: rom.platform_name,
                slug: rom.platform_slug,
              } as Platform);

              if (!platformFolder) {
                throw new Error(t("platformFolderNotFound"));
              }

              var fileList;

              if (RNPlatform.OS === "android") {
                fileList = (await SAF.listFiles(platformFolder.folderUri)).map(
                  (file) => file.name
                );
              } else {
                // For iOS, use expo-file-system
                fileList = await FileSystem.readDirectoryAsync(
                  platformFolder.folderUri
                );
              }

              console.log("File list in platform folder:", fileList);

              const romFile = fileList.find(
                (file) =>
                  file.replace(/\.[^/.]+$/, "") === fileNameWithoutExtension
              );
              if (romFile) {
                console.log(
                  "Deleting file:",
                  platformFolder.folderUri + "/" + romFile
                );

                if (RNPlatform.OS === "android") {
                  await SAF.unlink(platformFolder.folderUri + "/" + romFile);
                } else {
                  await FileSystem.deleteAsync(
                    platformFolder.folderUri + "/" + romFile
                  );
                }

                // Update the state to reflect that the file is no longer downloaded
                setExistingFilePath(null);
                // Refresh the ROM check in the global state
                resetRomsCheck([getSelectedFile()!]);

                showSuccessToast(
                  t("fileDeletedSuccessfully"),
                  t("fileDeleted")
                );
              }
            } catch (error) {
              console.error("Error deleting file:", error);
              const errorMessage =
                error instanceof Error ? error.message : t("errorDeletingFile");
              showErrorToast(
                t("cannotDeleteFile", { error: errorMessage }),
                t("error")
              );
            }
          },
        },
      ]
    );
  };

  const verifyRomFile = async (rom: Rom) => {
    const platformFolder = await searchPlatformFolder({
      name: rom.platform_name,
      slug: rom.platform_slug,
    } as Platform);
    if (!platformFolder) {
      return;
    }

    const selectedFile = getSelectedFile();

    if (!selectedFile) return;

    refreshRomCheck(selectedFile, platformFolder).then(() =>
      updateExistingFilePath(rom)
    );
  };

  const handleOpenWith = async (rom: Rom) => {
    try {
      // Construct the WebView URL: romm_url/rom/{rom_id}/ejs
      const url = `${apiClient.baseUrl}/rom/${rom.id}/ejs`;

      console.log("Opening ROM in WebView:", url);

      // Navigate to the WebView page
      router.push(
        `/webview/${encodeURIComponent(url)}?title=${encodeURIComponent(
          rom.name || rom.fs_name
        )}`
      );
    } catch (error) {
      console.error("Error opening ROM URL:", error);
      const errorMessage =
        error instanceof Error ? error.message : t("errorOpeningFile");
      showErrorToast(errorMessage, t("error"));
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>{t("loading")}</Text>
        </View>
      </ProtectedRoute>
    );
  }

  if (error || !rom) {
    return (
      <ProtectedRoute>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={64} color="#ef4444" />
          <Text style={styles.errorText}>{error || t("gameNotFound")}</Text>
          <TouchableOpacity style={styles.backButton} onPress={handleBack}>
            <Text style={styles.backButtonText}>{t("goBack")}</Text>
          </TouchableOpacity>
        </View>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.title}>{t("gameDetails")}</Text>
        </View>

        <View style={styles.content}>
          {rom.url_cover && (
            <Image
              source={{ uri: rom.url_cover }}
              style={styles.coverImage}
              resizeMode="contain"
            />
          )}

          <View style={styles.gameInfo}>
            <Text style={styles.gameName}>{rom.name || rom.fs_name}</Text>
            <Text style={styles.platformName}>{rom.platform_name}</Text>

            {rom.summary && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("description")}</Text>
                <Text style={styles.summary}>{rom.summary}</Text>
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("information")}</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>{t("platform")}:</Text>
                <Text style={styles.infoValue}>{rom.platform_name}</Text>
              </View>
              {rom.files.length < 2 && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t("size")}:</Text>
                  <Text style={styles.infoValue}>
                    {formatFileSize(rom.files[0].file_size_bytes)}
                  </Text>
                </View>
              )}
            </View>

            {/* Version Selector */}
            {rom.files && rom.files.length > 1 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t("selectVersion")}</Text>
                <TouchableOpacity
                  style={styles.versionSelector}
                  onPress={() => setShowVersionSelector(true)}
                >
                  <View style={styles.versionInfo}>
                    <Text style={styles.versionText}>
                      {getSelectedFile()?.file_name ||
                        `${t("version")} ${selectedFileIndex + 1}`}
                    </Text>
                    <Text style={styles.versionSize}>
                      {formatFileSize(getSelectedFile()?.file_size_bytes || 0)}
                    </Text>
                    <Text style={styles.versionCount}>
                      {selectedFileIndex + 1} / {rom.files.length}
                    </Text>
                  </View>
                  <Ionicons name="chevron-down" size={20} color="#ccc" />
                </TouchableOpacity>
              </View>
            )}

            {/* Download Section */}
            <View style={styles.section}>
              {(() => {
                const isDownloaded = rom && isRomDownloaded(getSelectedFile()!);
                const isChecking = rom && isCheckingRom(getSelectedFile()!);
                const isCurrentlyDownloading =
                  rom && isDownloading(getSelectedFile()!);

                if (isChecking) {
                  return (
                    <View style={styles.checkingContainer}>
                      <ActivityIndicator size="small" color="#007AFF" />
                      <Text style={styles.checkingText}>
                        {t("checkingExistingFiles")}
                      </Text>
                    </View>
                  );
                } else if (isDownloaded) {
                  return (
                    <View style={styles.alreadyDownloadedContainer}>
                      <View style={styles.alreadyDownloadedHeader}>
                        <Ionicons
                          name="checkmark-circle"
                          size={24}
                          color="#34C759"
                        />
                        <Text style={styles.alreadyDownloadedTitle}>
                          {t("fileAlreadyDownloaded")}
                        </Text>
                      </View>
                      <View style={styles.alreadyDownloadedActions}>
                        {EJS_SUPPORTED_PLATFORMS.includes(rom?.platform_slug) &&
                          emuJsEnabled && (
                            <TouchableOpacity
                              style={[styles.downloadButton, styles.openButton]}
                              onPress={() => handleOpenWith(rom)}
                            >
                              <Ionicons
                                name="play-outline"
                                size={20}
                                color="#fff"
                              />
                              <Text style={styles.downloadButtonText}>
                                {t("playOnEmuJS")}
                              </Text>
                            </TouchableOpacity>
                          )}
                        <TouchableOpacity
                          style={[
                            styles.downloadButton,
                            styles.redownloadButton,
                          ]}
                          onPress={handleDownload}
                          disabled={isCurrentlyDownloading}
                        >
                          <Ionicons
                            name="download-outline"
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.downloadButtonText}>
                            {t("redownload")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.downloadButton, styles.verifyButton]}
                          onPress={() => rom && verifyRomFile(rom)}
                        >
                          <Ionicons
                            name="refresh-outline"
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.downloadButtonText}>
                            {t("verify")}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.downloadButton, styles.deleteButton]}
                          onPress={() => handleDeleteFile(rom)}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={20}
                            color="#fff"
                          />
                          <Text style={styles.downloadButtonText}>
                            {t("delete")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                } else {
                  return (
                    <View style={styles.downloadSection}>
                      <View style={styles.buttonsRow}>
                        {/* Play button for supported platforms */}
                        {EJS_SUPPORTED_PLATFORMS.includes(rom?.platform_slug) &&
                          emuJsEnabled && (
                            <TouchableOpacity
                              style={[
                                styles.downloadButton,
                                styles.openButton,
                                styles.playButtonHorizontal,
                              ]}
                              onPress={() => handleOpenWith(rom)}
                            >
                              <Ionicons
                                name="play-outline"
                                size={20}
                                color="#fff"
                              />
                              <Text style={styles.downloadButtonText}>
                                {t("playOnEmuJS")}
                              </Text>
                            </TouchableOpacity>
                          )}

                        {/* Download button */}
                        <TouchableOpacity
                          style={[
                            styles.downloadButton,
                            styles.downloadButtonHorizontal,
                            isCurrentlyDownloading && styles.downloadingButton,
                            !(
                              EJS_SUPPORTED_PLATFORMS.includes(
                                rom?.platform_slug
                              ) && emuJsEnabled
                            ) && styles.downloadButtonFullWidth,
                          ]}
                          onPress={handleDownload}
                          disabled={isCurrentlyDownloading}
                        >
                          {/* Progress bar background when downloading */}
                          {isCurrentlyDownloading && (
                            <View
                              style={[
                                styles.progressBackground,
                                StyleSheet.absoluteFill,
                              ]}
                            >
                              <View
                                style={[
                                  styles.progressFill,
                                  { width: `${downloadProgress * 100}%` },
                                ]}
                              />
                            </View>
                          )}

                          {isCurrentlyDownloading ? (
                            <View style={styles.downloadingContent}>
                              <ActivityIndicator size="small" color="#fff" />
                              <Text style={styles.downloadButtonText}>
                                {currentDownload
                                  ? `${t("downloading")} ${Math.round(
                                      downloadProgress * 100
                                    )}%`
                                  : t("addedToQueue")}
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.downloadContent}>
                              <Ionicons
                                name="download-outline"
                                size={20}
                                color="#fff"
                              />
                              <Text style={styles.downloadButtonText}>
                                {t("downloadRom")}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                }
              })()}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Version Selector Modal */}
      <Modal
        visible={showVersionSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowVersionSelector(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t("selectVersion")}</Text>
              <TouchableOpacity
                onPress={() => setShowVersionSelector(false)}
                style={styles.closeButton}
              >
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={rom?.files || []}
              keyExtractor={(_, index) => index.toString()}
              renderItem={({ item, index }) => {
                const correspondingFile = rom?.files[index];
                return (
                  <TouchableOpacity
                    style={[
                      styles.versionItem,
                      selectedFileIndex === index && styles.versionItemSelected,
                    ]}
                    onPress={() => {
                      setSelectedFileIndex(index);
                      setShowVersionSelector(false);
                    }}
                  >
                    <View style={styles.versionItemContent}>
                      <Text
                        style={[
                          styles.versionItemTitle,
                          selectedFileIndex === index &&
                            styles.versionItemTitleSelected,
                        ]}
                      >
                        {item.file_name.replace(/\.[^/.]+$/, "") ||
                          `${t("version")} ${index + 1}`}
                      </Text>
                      <Text
                        style={[
                          styles.versionItemSubtitle,
                          selectedFileIndex === index &&
                            styles.versionItemSubtitleSelected,
                        ]}
                      >
                        {/* Display file extension */}
                        {correspondingFile?.file_name.split(".").pop()}
                      </Text>
                      <Text
                        style={[
                          styles.versionItemSize,
                          selectedFileIndex === index &&
                            styles.versionItemSizeSelected,
                        ]}
                      >
                        {formatFileSize(
                          correspondingFile?.file_size_bytes || 0
                        )}
                      </Text>
                    </View>
                    {selectedFileIndex === index && (
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#5f43b2"
                      />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </ProtectedRoute>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#000",
    padding: 20,
  },
  loadingText: {
    color: "#fff",
    fontSize: 16,
    marginTop: 10,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    textAlign: "center",
    marginTop: 16,
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: "#007AFF",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  backBtn: {
    marginRight: 16,
    padding: 8,
  },
  title: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  content: {
    padding: 20,
  },
  coverImage: {
    width: "100%",
    height: 300,
    borderRadius: 12,
    marginBottom: 20,
  },
  gameInfo: {
    flex: 1,
  },
  gameName: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 8,
  },
  platformName: {
    color: "#ccc",
    fontSize: 16,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  summary: {
    color: "#ccc",
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  infoLabel: {
    color: "#ccc",
    fontSize: 14,
  },
  infoValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  downloadButton: {
    backgroundColor: "#5f43b2",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    overflow: "hidden", // Ensure progress bar stays within button bounds
    position: "relative", // Allow for absolute positioning of progress bar
  },
  downloadSection: {
    gap: 10,
  },
  buttonsRow: {
    flexDirection: "row",
    gap: 10,
  },
  playButtonHorizontal: {
    flex: 0.4,
    marginTop: 0,
  },
  downloadButtonHorizontal: {
    flex: 0.6,
    marginTop: 0,
  },
  downloadButtonFullWidth: {
    flex: 1,
  },
  downloadingButton: {
    backgroundColor: "#666",
  },
  downloadContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  downloadingContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1, // Ensure content stays above progress bar
  },
  downloadButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  progressContainer: {
    marginTop: 12,
  },
  progressBar: {
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "rgba(95, 67, 178, 0.8)", // Semi-transparent version of button color
    borderRadius: 12,
  },
  progressBackground: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
    overflow: "hidden",
  },
  checkingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backgroundColor: "#111",
    borderRadius: 12,
    gap: 8,
  },
  checkingText: {
    color: "#007AFF",
    fontSize: 14,
    fontWeight: "500",
  },
  alreadyDownloadedContainer: {
    backgroundColor: "#1a2e1a",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#34C759",
  },
  alreadyDownloadedHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  alreadyDownloadedTitle: {
    color: "#34C759",
    fontSize: 16,
    fontWeight: "bold",
  },
  alreadyDownloadedPath: {
    color: "#ccc",
    fontSize: 12,
    marginBottom: 12,
    lineHeight: 16,
  },
  alreadyDownloadedActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  openButton: {
    backgroundColor: "#32D74B",
    flex: 0.3,
  },
  redownloadButton: {
    backgroundColor: "#FF9500",
    flex: 0.3,
  },
  verifyButton: {
    backgroundColor: "#007AFF",
    flex: 0.3,
  },
  deleteButton: {
    backgroundColor: "#FF3B30",
    flex: 0.3,
  },
  // Version Selector Styles
  versionSelector: {
    backgroundColor: "#111",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#333",
  },
  versionInfo: {
    flex: 1,
  },
  versionText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  versionSize: {
    color: "#ccc",
    fontSize: 14,
  },
  versionCount: {
    color: "#999",
    fontSize: 12,
    marginTop: 4,
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#111",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingTop: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  modalTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  closeButton: {
    padding: 4,
  },
  versionItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 12,
    backgroundColor: "#222",
  },
  versionItemSelected: {
    backgroundColor: "#2a1f4b",
    borderWidth: 1,
    borderColor: "#5f43b2",
  },
  versionItemContent: {
    flex: 1,
  },
  versionItemTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  versionItemTitleSelected: {
    color: "#5f43b2",
  },
  versionItemSubtitle: {
    color: "#ccc",
    fontSize: 14,
    marginBottom: 2,
  },
  versionItemSubtitleSelected: {
    color: "#fff",
  },
  versionItemSize: {
    color: "#999",
    fontSize: 12,
  },
  versionItemSizeSelected: {
    color: "#ccc",
  },
});

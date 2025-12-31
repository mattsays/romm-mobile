import { DownloadStatusBar } from '@/components/DownloadStatusBar';
import { useRomDownload } from '@/hooks/useRomDownload';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Pressable,
    RefreshControl,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FocusableButton } from '../../components/FocusableButton';
import { ProtectedRoute } from '../../components/ProtectedRoute';
import { useDownload } from '../../contexts/DownloadContext';
import { useToast } from '../../contexts/ToastContext';
import { useDynamicColumns } from '../../hooks/useDynamicColumns';
import { usePlatformFolders } from '../../hooks/usePlatformFolders';
import { useRomFileSystem } from '../../hooks/useRomFileSystem';
import { useRomsByCollection } from '../../hooks/useRoms';
import { useTranslation } from '../../hooks/useTranslation';
import { apiClient, Collection as ApiCollection, Platform, Rom } from '../../services/api';

interface CollectionScreenProps { }

export default function CollectionScreen({ }: CollectionScreenProps) {
    const { id, virtual } = useLocalSearchParams<{ id: string; virtual?: string }>();
    const collectionId = id;
    const isVirtual = virtual === 'true';
    const { t } = useTranslation();
    const { roms, loading, error, fetchRoms, loadMoreRoms, loadingMore, hasMore, total } = useRomsByCollection(collectionId, isVirtual);
    const [collection, setCollection] = useState<ApiCollection | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [isDownloadingAll, setIsDownloadingAll] = useState(false);
    const { activeDownloads, addRomToQueue, isRomDownloading, completedDownloads } = useDownload();
    const { downloadRom } = useRomDownload();
    const { showErrorToast, showInfoToast, showSuccessToast } = useToast();
    const { platformFolders, searchPlatformFolder } = usePlatformFolders();
    const { checkMultipleRoms, isRomDownloaded, isCheckingRom, refreshRomCheck } = useRomFileSystem();
    const insets = useSafeAreaInsets();

    // Dynamic columns based on screen orientation and device size
    const { columns, cardWidth, isLandscape } = useDynamicColumns();

    // Debug platform folders
    useEffect(() => {
        console.log('Platform folders updated:', platformFolders);
    }, [platformFolders]);

    // Fetch collection info and roms
    useEffect(() => {
        console.log('Fetching collection data for ID:', collectionId);
        const fetchData = async () => {
            try {
                console.log('Fetching collection data for ID:', collectionId, 'isVirtual:', isVirtual);
                const collectionData = await apiClient.getCollection(collectionId, isVirtual);
                setCollection(collectionData);
                await fetchRoms();
            } catch (error) {
                console.error('Error fetching collection data:', error);
                showErrorToast(
                    t('unableToLoadCollection'),
                    t('error')
                );
                router.back();
            }
        };

        if (collectionId) {
            fetchData();
        }
    }, [collectionId]);

    // Check filesystem for existing ROMs when ROMs are loaded
    useEffect(() => {
        Promise.all(roms.map(async rom => {
            const platformFolder = await searchPlatformFolder({ name: rom.platform_name, slug: rom.platform_slug } as Platform);
            if (!platformFolder) return;
            // Check all files for each ROM
            Promise.all(rom.files.map(file => refreshRomCheck(file, platformFolder)));
        }));
    }, [roms, platformFolders]);

    // Monitor completed downloads to refresh ROM status in collection view
    useEffect(() => {
        Promise.all(completedDownloads.map(downloadedItem => refreshRomCheck(downloadedItem.romFile, downloadedItem.platformFolder)));
    }, [completedDownloads.length, roms.length]);


    const onRefresh = async () => {
        setRefreshing(true);
        try {
            await fetchRoms();
            console.log('Collection data refreshed, forcing complete ROM check');

            // Force a complete refresh of ROM checks for all ROMs
            setTimeout(async () => {
                if (roms && roms.length > 0) {
                    console.log('Force refreshing all ROM checks in collection');
                    for (const rom of roms) {
                        const platformFolder = await searchPlatformFolder({ name: rom.platform_name, slug: rom.platform_slug } as Platform);
                        if (!platformFolder) continue;
                        await refreshRomCheck(rom.files[0], platformFolder);
                    }
                    console.log('All collection ROM checks refreshed');
                }
            }, 500); // Small delay to ensure data is updated
        } catch (error) {
            console.error('Error during refresh:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const handleDownload = async (rom: Rom) => {
        if (!rom) return;

        try {
            await downloadRom(rom, rom.files[0], { name: rom.platform_name, slug: rom.platform_slug } as Platform);
        } catch (error: any) {
            console.error('Download error:', error);

            if (error.type === 'already_downloaded') {
                showInfoToast(error.message, t('fileAlreadyDownloaded'));
            } else {
                const errorMessage = error instanceof Error ? error.message : t('errorDuringDownload');
                showErrorToast(
                    errorMessage,
                    t('downloadError')
                );
            }
        }
    };

    const handleDownloadAll = async () => {
        if (!collection || roms.length === 0) {
            showErrorToast(t('noRomsAvailable'), t('error'));
            return;
        }

        // Get all unique platforms from the collection's ROMs
        const uniquePlatforms = [...new Set(roms.map(rom => ({ name: rom.platform_name, slug: rom.platform_slug } as Platform)))];

        // Check if all platforms have configured folders
        const missingFolders: string[] = [];
        for (const platform of uniquePlatforms) {
            const platformFolder = await searchPlatformFolder(platform);
            if (!platformFolder) {
                const missingFolderRom = roms.find(rom => rom.platform_slug === platform?.slug);
                if (missingFolderRom) {
                    missingFolders.push(platform.name);
                }
            }
        }

        if (missingFolders.length > 0) {
            Alert.alert(
                t('error'),
                t('selectFolderFirst', { platform: missingFolders.join(', ') }),
                [{ text: t('ok'), style: 'default' }]
            );
            return;
        }

        // Filter out ROMs that are already being downloaded or already exist on filesystem
        const romsToDownload = roms.filter(rom => !isRomDownloading(rom.files[0]) && !isRomDownloaded(rom.files[0]));

        if (romsToDownload.length === 0) {
            showInfoToast(t('allRomsDownloaded'), t('info'));
            return;
        }

        Alert.alert(
            t('confirmDownload'),
            t('downloadAllRomsQuestionCollection', { count: romsToDownload.length.toString(), collection: collection.name }),
            [
                { text: t('cancel'), style: 'cancel' },
                {
                    text: t('downloadAll'),
                    onPress: async () => {
                        setIsDownloadingAll(true);
                        try {
                            // Add all ROMs to download queue with their respective platform folders
                            for (const rom of romsToDownload) {
                                const platformFolder = await searchPlatformFolder({ name: rom.platform_name, slug: rom.platform_slug } as Platform);
                                if (platformFolder) {
                                    addRomToQueue(rom, rom.files[0], platformFolder);
                                }
                            }

                            showSuccessToast(
                                t('romsAddedToQueue', { count: romsToDownload.length.toString() }),
                                t('downloadAllStarted')
                            );
                        } catch (error) {
                            console.error('Error adding ROMs to queue:', error);
                            showErrorToast(t('errorAddingToQueue'), t('error'));
                        } finally {
                            setIsDownloadingAll(false);
                        }
                    }
                }
            ]
        );
    };

    const RomCard = ({ rom }: { rom: Rom & { isEmpty?: boolean } }) => {
        if (rom.isEmpty) {
            return <View style={[styles.gameCard, { width: cardWidth }]} />;
        }

        const hasImage = rom.url_cover && rom.url_cover.trim() !== '';

        // Calculate card height based on width to maintain aspect ratio
        const cardHeight = Math.floor(cardWidth * 1.4); // 1.4 aspect ratio

        // Helper function to count downloaded versions
        const getDownloadedVersionsCount = () => {
            if (!rom.files || rom.files.length === 0) return 0;
            return rom.files.filter(file => isRomDownloaded(file)).length;
        };

        // Helper function to check if any version is downloading
        const isAnyVersionDownloading = () => {
            if (!rom.files || rom.files.length === 0) return false;
            return rom.files.some(file => isRomDownloading(file));
        };

        // Helper function to check if any version is being checked
        const isAnyVersionChecking = () => {
            if (!rom.files || rom.files.length === 0) return false;
            return rom.files.some(file => isCheckingRom(file));
        };

        const downloadedCount = getDownloadedVersionsCount();
        const totalVersions = rom.files?.length || 0;
        const hasMultipleVersions = totalVersions > 1;
        const anyDownloaded = downloadedCount > 0;
        const anyDownloading = isAnyVersionDownloading();
        const anyChecking = isAnyVersionChecking();
        const allDownloaded = downloadedCount === totalVersions && totalVersions > 0;

        // TV focus state
        const [focused, setFocused] = useState(false);

        return (
            <Pressable
                style={[
                    styles.gameCard,
                    { width: cardWidth },
                    focused ? styles.gameCardFocused : null
                ]}
                onPress={() => router.push(`/game/${rom.id}`)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                hasTVPreferredFocus={false}
                isTVSelectable={true}
                focusable={true}
                accessible={true}
            >
                <View style={[styles.gameImageContainer, { height: cardHeight }]}>
                    {hasImage ? (
                        <Image
                            source={{ uri: rom.url_cover }}
                            style={styles.gameImage}
                        />
                    ) : (
                        <View style={styles.placeholderContainer}>
                            <Ionicons name="game-controller-outline" size={Math.min(32, cardWidth * 0.2)} color="#666" />
                            <Text style={[styles.gameTitle, { fontSize: Math.min(14, cardWidth * 0.1) }]} numberOfLines={2}>
                                {rom.name || rom.fs_name}
                            </Text>
                        </View>
                    )}

                    {/* Status Badges */}
                    {anyDownloaded && (
                        <View style={styles.completedBadge}>
                            <Ionicons name="checkmark-circle" size={Math.min(24, cardWidth * 0.16)} color="#34C759" />
                            {hasMultipleVersions && (
                                <Text style={styles.versionCountBadge}>
                                    {downloadedCount}/{totalVersions}
                                </Text>
                            )}
                        </View>
                    )}
                    {anyChecking && !anyDownloaded && (
                        <View style={styles.checkingBadge}>
                            <ActivityIndicator size={Math.min(16, cardWidth * 0.11)} color="#FF9500" />
                        </View>
                    )}
                    {anyDownloading && (
                        <View style={styles.downloadingBadge}>
                            <Ionicons name="download" size={Math.min(20, cardWidth * 0.13)} color="#FFFFFF" />
                        </View>
                    )}

                    {/* Download Button - Only show if not all versions downloaded and none downloading */}
                    {!anyDownloaded && !anyDownloading && (
                        <View style={styles.romOverlay}>
                            <FocusableButton
                                style={[styles.downloadButton, {
                                    width: Math.min(32, cardWidth * 0.21),
                                    height: Math.min(32, cardWidth * 0.21)
                                }]}
                                onPress={() => handleDownload(rom)}
                            >
                                <Ionicons name="download-outline" size={Math.min(16, cardWidth * 0.11)} color="#fff" />
                            </FocusableButton>
                        </View>
                    )}
                </View>
            </Pressable>
        );
    };

    if (loading && !collection) {
        return (
            <View style={[styles.container, styles.centered]}>
                <ActivityIndicator size="large" color="#fff" />
                <Text style={styles.loadingText}>{t('loadingCollection')}</Text>
            </View>
        );
    }

    // Prepare data for FlatList with empty items to fill last row
    const prepareGridData = (data: Rom[]) => {
        const totalItems = data.length;
        const remainder = totalItems % columns;
        if (remainder === 0) return data;

        const emptyItems = columns - remainder;
        const paddedData = [...data];
        for (let i = 0; i < emptyItems; i++) {
            paddedData.push({ id: `empty-${i}`, isEmpty: true } as any);
        }
        return paddedData;
    };

    // Footer component for loading more items
    const renderFooter = () => {
        if (!loadingMore) return null;

        return (
            <View style={styles.loadingFooter}>
                <ActivityIndicator size="small" color="#5f43b2" />
                <Text style={styles.loadingFooterText}>{t('loadingMore')}</Text>
            </View>
        );
    };

    // Handle end reached for infinite scroll
    const handleEndReached = () => {
        if (hasMore && !loadingMore && !loading) {
            console.log('Loading more ROMs...');
            loadMoreRoms();
        }
    };

    // Calculate available ROMs to download
    const availableToDownload = roms.filter(rom => !isRomDownloading(rom.files[0]) && !isRomDownloaded(rom.files[0])).length;

    return (
        <ProtectedRoute>
            <View style={styles.container}>
                {/* Header */}
                <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
                    <View style={styles.headerTop}>
                        <FocusableButton
                            style={styles.backButton}
                            onPress={() => router.back()}
                        >
                            <Ionicons name="arrow-back" size={24} color="#fff" />
                        </FocusableButton>
                        <View style={styles.headerInfo}>
                            <Text style={styles.headerTitle} numberOfLines={1}>
                                {collection?.name || t('collection')}
                            </Text>
                            <Text style={styles.headerSubtitle}>
                                {total !== null ? `${roms.length}/${total}` : roms.length} {t('games')}
                            </Text>
                        </View>
                        <View style={styles.headerButtons}>
                            <FocusableButton
                                style={[
                                    styles.downloadAllButton,
                                    availableToDownload === 0 && styles.downloadAllButtonDisabled
                                ]}
                                onPress={handleDownloadAll}
                                disabled={isDownloadingAll || availableToDownload === 0}
                            >
                                {isDownloadingAll ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Ionicons name="download" size={20} color="#fff" />
                                        {availableToDownload > 0 && (
                                            <Text style={styles.downloadAllText}>{availableToDownload}</Text>
                                        )}
                                    </>
                                )}
                            </FocusableButton>
                        </View>
                    </View>
                    {collection?.description && (
                        <Text style={styles.description}>
                            {collection.description}
                        </Text>
                    )}
                </View>

                {/* Roms Grid */}
                <FlatList
                    data={prepareGridData(roms)}
                    renderItem={({ item }) => <RomCard rom={item} />}
                    keyExtractor={(item) => item.id.toString()}
                    numColumns={columns}
                    key={`${columns}-${isLandscape}`} // Force re-render when columns or orientation change
                    columnWrapperStyle={columns > 1 ? styles.row : undefined}
                    contentContainerStyle={styles.gamesContainer}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={onRefresh}
                            colors={['#5f43b2']}
                            tintColor="#5f43b2"
                        />
                    }
                    ListEmptyComponent={
                        !loading ? (
                            <View style={styles.emptyContainer}>
                                <Ionicons name="library-outline" size={64} color="#666" />
                                <Text style={styles.emptyText}>
                                    {t('noGamesInCollection')}
                                </Text>
                            </View>
                        ) : null
                    }
                    ListFooterComponent={renderFooter}
                    onEndReached={handleEndReached}
                    onEndReachedThreshold={0.1}
                    contentInsetAdjustmentBehavior="automatic"
                />

                <DownloadStatusBar onPress={() => router.push('/downloads')} />
            </View>
        </ProtectedRoute>
    );
}



const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        fontSize: 16,
        marginTop: 10,
    },
    header: {
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    backButton: {
        marginRight: 15,
        padding: 5,
    },
    headerInfo: {
        flex: 1,
    },
    headerButtons: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    headerSubtitle: {
        color: '#999',
        fontSize: 14,
        marginTop: 2,
    },
    description: {
        color: '#ccc',
        fontSize: 14,
        lineHeight: 20,
    },
    gamesContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    row: {
        justifyContent: 'space-between',
        paddingHorizontal: 0,
        marginBottom: 15,
    },
    gameCard: {
        marginTop: 20,
        marginBottom: 15,
        borderWidth: 6,
        borderColor: 'transparent',
        borderRadius: 12,
    },
    gameImageContainer: {
        position: 'relative',
        width: '100%',
    },
    gameImage: {
        width: '100%',
        height: "100%",
        borderRadius: 12,
        backgroundColor: '#333',
        objectFit: 'cover',
    },
    placeholderContainer: {
        width: '100%',
        height: '100%',
        backgroundColor: '#222',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 8,
        borderRadius: 12,
    },
    gameTitle: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        textAlign: 'center',
        lineHeight: 18,
        marginTop: 8,
    },
    romOverlay: {
        position: 'absolute',
        top: 8,
        right: 8,
    },
    downloadButton: {
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    downloadButtonDisabled: {
        backgroundColor: 'rgba(95, 67, 178, 0.7)',
    },
    completedBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        borderRadius: 15,
        padding: 2,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    versionCountBadge: {
        color: '#34C759',
        fontSize: 10,
        fontWeight: 'bold',
        marginLeft: 2,
        marginRight: 8,
    },
    checkingBadge: {
        position: 'absolute',
        top: 8,
        right: 8,
        backgroundColor: 'rgba(255, 149, 0, 0.9)',
        borderRadius: 12,
        padding: 4,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    downloadingBadge: {
        position: 'absolute',
        top: 8,
        left: 8,
        backgroundColor: 'rgba(0, 122, 255, 0.9)',
        borderRadius: 12,
        padding: 4,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.3,
        shadowRadius: 3,
        elevation: 5,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        color: '#666',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 16,
    },
    downloadAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        padding: 10,
        borderRadius: 8,
        backgroundColor: '#007AFF',
        minWidth: 44,
        minHeight: 44,
        justifyContent: 'center',
    },
    downloadAllButtonDisabled: {
        backgroundColor: '#555',
        opacity: 0.6,
    },
    downloadAllText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
        minWidth: 16,
        textAlign: 'center',
    },
    loadingFooter: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 20,
        gap: 10,
    },
    loadingFooterText: {
        color: '#999',
        fontSize: 14,
    },
    gameCardFocused: {
        borderWidth: 6,
        borderColor: '#5f43b2',
        backgroundColor: '#3c2a70',
        shadowColor: '#5f43b2',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 12,
        elevation: 8,
        borderRadius: 12,
    },
});

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import {
    FlatList,
    Image,
    SafeAreaView,
    StyleSheet,
    Text,
    View
} from 'react-native';
import { FocusableButton } from '../../components/FocusableButton';
import { DownloadItem, DownloadStatus, useDownload } from '../../contexts/DownloadContext';
import { useTranslation } from '../../hooks/useTranslation';

export default function DownloadsScreen() {
    const { t } = useTranslation();
    const {
        downloads,
        activeDownloads,
        completedDownloads,
        failedDownloads,
        removeFromQueue,
        retryDownload,
        clearCompleted,
        clearFailed,
        pauseDownload,
        resumeDownload,
        cancelDownload,
    } = useDownload();

    const formatBytes = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatSpeed = (bytesPerSecond: number): string => {
        if (!bytesPerSecond || bytesPerSecond < 1 || !isFinite(bytesPerSecond)) {
            return '0 B/s';
        }
        return formatBytes(bytesPerSecond) + '/s';
    };

    const formatTime = (seconds: number): string => {
        if (seconds === 0 || !isFinite(seconds) || seconds > 86400) return '--'; // More than 24 hours

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    };

    const getStatusColor = (status: DownloadStatus): string => {
        switch (status) {
            case DownloadStatus.DOWNLOADING:
                return '#007AFF';
            case DownloadStatus.EXTRACTING:
                return '#5856D6'; // Purple for extracting
            case DownloadStatus.MOVING:
                return '#FF9500'; // Orange for moving files
            case DownloadStatus.COMPLETED:
                return '#34C759';
            case DownloadStatus.FAILED:
            case DownloadStatus.CANCELLED:
                return '#FF3B30';
            case DownloadStatus.PAUSED:
                return '#FF9500';
            case DownloadStatus.PENDING:
                return '#8E8E93';
            default:
                return '#8E8E93';
        }
    };

    const getStatusText = (status: DownloadStatus): string => {
        switch (status) {
            case DownloadStatus.DOWNLOADING:
                return t('downloading');
            case DownloadStatus.EXTRACTING:
                return t('extracting');
            case DownloadStatus.MOVING:
                return t('moving');
            case DownloadStatus.COMPLETED:
                return t('completed');
            case DownloadStatus.FAILED:
                return t('failed');
            case DownloadStatus.CANCELLED:
                return t('cancelled');
            case DownloadStatus.PAUSED:
                return t('paused');
            case DownloadStatus.PENDING:
                return t('pending');
            default:
                return t('unknown');
        }
    };

    const renderDownloadItem = ({ item }: { item: DownloadItem }) => (
        <View style={styles.downloadItem}>
            <View style={styles.downloadHeader}>
                {item.rom.url_cover && (
                    <Image
                        source={{ uri: item.rom.url_cover }}
                        style={styles.gameIcon}
                    />
                )}
                <View style={styles.downloadInfo}>
                    <Text style={styles.gameName} numberOfLines={1}>
                        {item.rom.name || item.rom.fs_name}
                    </Text>
                    <Text style={styles.platformName}>{item.rom.platform_name}</Text>
                    <View style={styles.statusRow}>
                        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                            <Text style={styles.statusText}>{getStatusText(item.status)}</Text>
                        </View>
                        {item.status === DownloadStatus.DOWNLOADING && (
                            <Text style={styles.speedText}>
                                {formatTime(item.remainingTime)}
                            </Text>
                        )}
                    </View>
                </View>
                <View style={styles.downloadActions}>
                    {item.status === DownloadStatus.DOWNLOADING && (
                        <FocusableButton
                            style={styles.actionButton}
                            onPress={() => pauseDownload(item.id)}
                        >
                            <Ionicons name="pause" size={20} color="#007AFF" />
                        </FocusableButton>
                    )}
                    {item.status === DownloadStatus.PAUSED && (
                        <FocusableButton
                            style={styles.actionButton}
                            onPress={() => resumeDownload(item.id)}
                        >
                            <Ionicons name="play" size={20} color="#34C759" />
                        </FocusableButton>
                    )}
                    {(item.status === DownloadStatus.FAILED || item.status === DownloadStatus.CANCELLED) && (
                        <FocusableButton
                            style={styles.actionButton}
                            onPress={() => retryDownload(item.id)}
                        >
                            <Ionicons name="refresh" size={20} color="#FF9500" />
                        </FocusableButton>
                    )}
                    {(item.status === DownloadStatus.PENDING ||
                        item.status === DownloadStatus.DOWNLOADING ||
                        item.status === DownloadStatus.PAUSED ||
                        item.status === DownloadStatus.EXTRACTING ||
                        item.status === DownloadStatus.MOVING) && (
                            <FocusableButton
                                style={styles.actionButton}
                                onPress={() => cancelDownload(item.id)}
                            >
                                <Ionicons name="close" size={20} color="#FF3B30" />
                            </FocusableButton>
                        )}
                    <FocusableButton
                        style={styles.actionButton}
                        onPress={() => removeFromQueue(item.id)}
                    >
                        <Ionicons name="trash" size={20} color="#8E8E93" />
                    </FocusableButton>
                </View>
            </View>

            {/* Progress bar for downloading items */}
            {(item.status === DownloadStatus.DOWNLOADING ||
                item.status === DownloadStatus.PAUSED ||
                item.status === DownloadStatus.EXTRACTING ||
                item.status === DownloadStatus.MOVING) && (
                    <View style={styles.progressSection}>
                        <View style={styles.progressBar}>
                            <View
                                style={[
                                    styles.progressFill,
                                    {
                                        width: `${item.progress}%`,
                                        backgroundColor: getStatusColor(item.status)
                                    }
                                ]}
                            />
                        </View>
                        <View style={styles.progressInfo}>
                            <Text style={styles.progressText}>
                                {item.status === DownloadStatus.EXTRACTING || item.status === DownloadStatus.MOVING
                                    ? getStatusText(item.status)
                                    : `${formatBytes(item.downloadedBytes)} / ${formatBytes(item.totalBytes)}`
                                }
                            </Text>
                            <View style={styles.rightProgressInfo}>
                                {item.status === DownloadStatus.DOWNLOADING && item.speed > 0 && (
                                    <Text style={styles.progressSpeed}>
                                        {formatSpeed(item.speed)}
                                    </Text>
                                )}
                                <Text style={styles.progressPercentage}>{item.progress}%</Text>
                            </View>
                        </View>
                    </View>
                )}

            {/* Error message for failed downloads */}
            {item.status === DownloadStatus.FAILED && item.error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{item.error}</Text>
                </View>
            )}
        </View>
    );

    const EmptyState = ({ title, subtitle }: { title: string; subtitle: string }) => (
        <View style={styles.emptyState}>
            <Ionicons name="download-outline" size={64} color="#8E8E93" />
            <Text style={styles.emptyTitle}>{title}</Text>
            <Text style={styles.emptySubtitle}>{subtitle}</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <FocusableButton
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </FocusableButton>
                <Text style={styles.title}>{t('downloads')}</Text>
                <View style={styles.headerSpacer} />
            </View>

            {/* Summary */}
            <View style={styles.summary}>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryNumber}>{activeDownloads.length}</Text>
                    <Text style={styles.summaryLabel}>{t('active')}</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryNumber}>{completedDownloads.length}</Text>
                    <Text style={styles.summaryLabel}>{t('completed')}</Text>
                </View>
                <View style={styles.summaryItem}>
                    <Text style={styles.summaryNumber}>{failedDownloads.length}</Text>
                    <Text style={styles.summaryLabel}>{t('failed')}</Text>
                </View>
            </View>

            {/* Clear buttons */}
            {(completedDownloads.length > 0 || failedDownloads.length > 0) && (
                <View style={styles.clearButtons}>
                    {completedDownloads.length > 0 && (
                        <FocusableButton
                            style={[styles.clearButton, styles.clearCompletedButton]}
                            onPress={clearCompleted}
                        >
                            <Text style={styles.clearButtonText}>{t('clearCompleted')}</Text>
                        </FocusableButton>
                    )}
                    {failedDownloads.length > 0 && (
                        <FocusableButton
                            style={[styles.clearButton, styles.clearFailedButton]}
                            onPress={clearFailed}
                        >
                            <Text style={styles.clearButtonText}>{t('clearFailed')}</Text>
                        </FocusableButton>
                    )}
                </View>
            )}

            {/* Downloads list */}
            {downloads.length > 0 ? (
                <FlatList
                    data={downloads.sort((a, b) => {
                        // Priority order: DOWNLOADING > PENDING > PAUSED > FAILED/CANCELLED > COMPLETED
                        const statusPriority = {
                            [DownloadStatus.DOWNLOADING]: 1,
                            [DownloadStatus.EXTRACTING]: 2,
                            [DownloadStatus.MOVING]: 3,
                            [DownloadStatus.PENDING]: 4,
                            [DownloadStatus.PAUSED]: 5,
                            [DownloadStatus.FAILED]: 6,
                            [DownloadStatus.CANCELLED]: 6,
                            [DownloadStatus.COMPLETED]: 7,
                        };

                        const priorityA = statusPriority[a.status] || 6;
                        const priorityB = statusPriority[b.status] || 6;

                        // If same priority, sort by start time (newer first)
                        if (priorityA === priorityB) {
                            const timeA = a.startTime?.getTime() || 0;
                            const timeB = b.startTime?.getTime() || 0;
                            return timeB - timeA;
                        }

                        return priorityA - priorityB;
                    })}
                    keyExtractor={(item) => item.id}
                    renderItem={renderDownloadItem}
                    style={styles.downloadsList}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.listContainer}
                />
            ) : (
                <EmptyState
                    title={t('noDownloads')}
                    subtitle={t('noDownloadsDescription')}
                />
            )}
        </SafeAreaView>
    );
}



const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 30,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    backButton: {
        padding: 8,
    },
    title: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    headerSpacer: {
        width: 40, // Same width as back button to center title
    },
    summary: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 20,
        paddingHorizontal: 20,
        backgroundColor: '#111',
        marginBottom: 10,
    },
    summaryItem: {
        alignItems: 'center',
    },
    summaryNumber: {
        color: '#fff',
        fontSize: 24,
        fontWeight: 'bold',
    },
    summaryLabel: {
        color: '#8E8E93',
        fontSize: 12,
        marginTop: 4,
    },
    clearButtons: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        paddingBottom: 10,
        gap: 10,
    },
    clearButton: {
        flex: 1,
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    clearCompletedButton: {
        backgroundColor: '#34C759',
    },
    clearFailedButton: {
        backgroundColor: '#FF3B30',
    },
    clearButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    downloadsList: {
        flex: 1,
    },
    listContainer: {
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    downloadItem: {
        backgroundColor: '#111',
        marginBottom: 12,
        borderRadius: 12,
        padding: 16,
    },
    downloadHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    gameIcon: {
        width: 50,
        height: 50,
        borderRadius: 8,
        marginRight: 12,
    },
    downloadInfo: {
        flex: 1,
    },
    gameName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    platformName: {
        color: '#8E8E93',
        fontSize: 14,
        marginBottom: 8,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    statusText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
    },
    speedText: {
        color: '#8E8E93',
        fontSize: 12,
    },
    downloadActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        padding: 8,
    },
    progressSection: {
        marginTop: 12,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressFill: {
        height: '100%',
        borderRadius: 2,
    },
    progressInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    rightProgressInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    progressText: {
        color: '#8E8E93',
        fontSize: 12,
    },
    progressSpeed: {
        color: '#007AFF',
        fontSize: 12,
        fontWeight: '600',
    },
    progressPercentage: {
        color: '#8E8E93',
        fontSize: 12,
        fontWeight: '600',
    },
    errorContainer: {
        marginTop: 8,
        padding: 8,
        backgroundColor: '#2D1B1B',
        borderRadius: 8,
        borderLeftWidth: 3,
        borderLeftColor: '#FF3B30',
    },
    errorText: {
        color: '#FF3B30',
        fontSize: 12,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
    },
    emptyTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
        marginTop: 16,
        marginBottom: 8,
    },
    emptySubtitle: {
        color: '#8E8E93',
        fontSize: 16,
        textAlign: 'center',
    },
});

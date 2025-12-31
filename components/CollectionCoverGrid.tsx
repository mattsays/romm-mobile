import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { apiClient } from '../services/api';

interface CollectionCoverGridProps {
    covers: string[];
    style?: any;
}

export const CollectionCoverGrid: React.FC<CollectionCoverGridProps> = ({ covers, style }) => {
    // Take up to 4 random covers for the grid
    const selectedCovers = covers && covers.length > 0 ?
        covers
            .slice(0, 4) // Take first 4
            .map(cover => `${apiClient.baseUrl}${cover}`) // Complete the URL
        : [];

    if (selectedCovers.length === 0) {
        return (
            <View style={[styles.placeholder, style]}>
                <Ionicons name="library-outline" size={32} color="#666" />
            </View>
        );
    }

    const renderGrid = () => {
        if (selectedCovers.length === 1) {
            return (
                <Image
                    source={{ uri: selectedCovers[0] }}
                    style={styles.singleCover}
                />
            );
        }

        if (selectedCovers.length === 2) {
            return (
                <View style={styles.twoCoversContainer}>
                    <Image
                        source={{ uri: selectedCovers[0] }}
                        style={styles.halfCover}
                    />
                    <Image
                        source={{ uri: selectedCovers[1] }}
                        style={styles.halfCover}
                    />
                </View>
            );
        }

        if (selectedCovers.length === 3) {
            return (
                <View style={styles.threeCoversContainer}>
                    <Image
                        source={{ uri: selectedCovers[0] }}
                        style={styles.halfCover}
                    />
                    <View style={styles.rightColumn}>
                        <Image
                            source={{ uri: selectedCovers[1] }}
                            style={styles.quarterCover}
                        />
                        <Image
                            source={{ uri: selectedCovers[2] }}
                            style={styles.quarterCover}
                        />
                    </View>
                </View>
            );
        }

        // 4 covers
        return (
            <View style={styles.fourCoversContainer}>
                <View style={styles.leftColumn}>
                    <Image
                        source={{ uri: selectedCovers[0] }}
                        style={styles.quarterCover}
                    />
                    <Image
                        source={{ uri: selectedCovers[1] }}
                        style={styles.quarterCover}
                    />
                </View>
                <View style={styles.rightColumn}>
                    <Image
                        source={{ uri: selectedCovers[2] }}
                        style={styles.quarterCover}
                    />
                    <Image
                        source={{ uri: selectedCovers[3] }}
                        style={styles.quarterCover}
                    />
                </View>
            </View>
        );
    };

    return (
        <View style={[styles.container, style]}>
            {renderGrid()}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
    },
    placeholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#222',
    },
    singleCover: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    twoCoversContainer: {
        flexDirection: 'row',
        flex: 1,
    },
    threeCoversContainer: {
        flexDirection: 'row',
        flex: 1,
    },
    fourCoversContainer: {
        flexDirection: 'row',
        flex: 1,
    },
    leftColumn: {
        flex: 1,
        flexDirection: 'column',
    },
    rightColumn: {
        flex: 1,
        flexDirection: 'column',
    },
    halfCover: {
        flex: 1,
        resizeMode: 'cover',
    },
    quarterCover: {
        flex: 1,
        resizeMode: 'cover',
    },
});

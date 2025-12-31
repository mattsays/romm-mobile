import React, { useState } from 'react';
import { StyleSheet, Switch, Text, View, ViewStyle } from 'react-native';
import { FocusableButton } from './FocusableButton';

interface FocusableSwitchRowProps {
    label: string;
    description?: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    style?: ViewStyle;
}

export function FocusableSwitchRow({
    label,
    description,
    value,
    onValueChange,
    style
}: FocusableSwitchRowProps) {
    const [focused, setFocused] = useState(false);

    return (
        <FocusableButton
            onPress={() => onValueChange(!value)}
            style={[styles.container, style]}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
        >
            <View style={styles.textContainer}>
                <Text style={styles.label}>{label}</Text>
                {description && (
                    <Text style={styles.description}>{description}</Text>
                )}
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                trackColor={{ false: '#767577', true: '#5f43b2' }}
                thumbColor={value ? '#fff' : '#f4f3f4'}
                // On Android/iOS, the switch itself might steal focus if not handled carefully.
                // By wrapping in FocusableButton (Pressable), we usually handle interaction via the row.
                // We might want to disable focus on the switch itself if the row is focusable.
                focusable={false}
            />
        </FocusableButton>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#111',
        borderRadius: 12,
        marginBottom: 10,
    },
    textContainer: {
        flex: 1,
        marginRight: 16,
    },
    label: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginBottom: 4,
    },
    description: {
        color: '#ccc',
        fontSize: 14,
        lineHeight: 18,
    },
});

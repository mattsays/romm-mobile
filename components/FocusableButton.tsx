import React, { useState } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';

interface FocusableButtonProps {
    style?: StyleProp<ViewStyle>;
    onPress?: () => void;
    children: React.ReactNode;
    disabled?: boolean;
    [key: string]: any;
}

export function FocusableButton({ style, onPress, children, disabled, ...props }: FocusableButtonProps) {
    const [focused, setFocused] = useState(false);

    return (
        <Pressable
            {...props}
            onPress={onPress}
            disabled={disabled}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={({ pressed }) => [
                styles.base,
                style,
                focused && styles.focused,
                // Ensure style overrides (like width/height) are preserved but focus styles take precedence for border/bg if needed
                // However, we usually want the base style to define the shape and the focus style to just add the border/color
            ]}
        >
            {children}
        </Pressable>
    );
}

const styles = StyleSheet.create({
    base: {
        borderWidth: 2,
        borderColor: 'transparent',
        // Default borderRadius can be overridden
        borderRadius: 12,
    },
    focused: {
        borderColor: '#5f43b2',
        backgroundColor: '#3c2a70',
        borderWidth: 2,
        // Ensure borderRadius matches base if not overridden, but here we enforce consistency
        borderRadius: 12,
    }
});

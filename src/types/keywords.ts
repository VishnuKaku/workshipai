// Base interface for translations without direction
export interface BaseTranslation {
    en: string;
    fr?: string;
    de?: string;
    es?: string;
    it?: string;
    nl?: string;
    pt?: string;
    sv?: string;
    da?: string;
    no?: string;
    fi?: string;
    cs?: string;
    pl?: string;
    hu?: string;
    sk?: string;
    sl?: string;
    et?: string;
    lv?: string;
    lt?: string;
    el?: string;
    mt?: string;
}

// Interface for translations that require direction
export interface DirectionalTranslation extends BaseTranslation {
    direction: 'left' | 'right';
}

// Interface for generic translations that may have direction
export interface Translation extends BaseTranslation {
    direction?: 'left' | 'right';
}

// Interface defining the structure of the keywords object
export interface Keywords {
    arrival: DirectionalTranslation;
    departure: DirectionalTranslation;
    airport: BaseTranslation;
    immigration_in: BaseTranslation;
    immigration_out: BaseTranslation;
}

// Type for valid language keys (excluding direction)
export type LanguageKeys = keyof BaseTranslation;

// Type for valid keyword keys
export type KeywordType = keyof Keywords;

// Helper type for getting translation type based on keyword
export type TranslationType<K extends KeywordType> = Keywords[K];

export default Keywords;
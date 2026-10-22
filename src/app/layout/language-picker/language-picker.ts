import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface MenuLabel {
  id: string;
  label: string;
}

export interface MenuTranslationResult {
  language: string;
  translations: Record<string, string>;
}

interface MenuCatalogEntry {
  nativeName: string;
  labels: Record<string, string>;
  tools: string[];
}

interface LanguageOption {
  key: string;
  name: string;
  available: boolean;
}

@Component({
  selector: 'app-language-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './language-picker.html',
  styleUrl: './language-picker.css',
})
export class LanguagePickerComponent implements OnInit {
  @Input() labels: MenuLabel[] = [];
  @Input() activeLanguage = 'English';
  @Output() translationsReady = new EventEmitter<MenuTranslationResult>();

  selectedLanguage = 'English';
  languageSearch = '';
  isLanguageListOpen = false;
  isLoading = true;
  error = '';
  languages: Record<string, MenuCatalogEntry> = {};
  languageNames: string[] = [];

  get languageOptions(): LanguageOption[] {
    const names = new Set([...this.languageNames, ...Object.keys(this.languages)]);
    names.delete('English');
    return [...names].map((name) => ({
      key: name,
      name: this.languages[name]?.nativeName || name,
      available: Boolean(this.languages[name]),
    }));
  }

  get filteredLanguages(): LanguageOption[] {
    const query = this.languageSearch.trim().toLocaleLowerCase();
    return this.languageOptions
      .filter((language) => !query || language.key.toLocaleLowerCase().includes(query) || language.name.toLocaleLowerCase().includes(query))
      .sort((a, b) => a.key.localeCompare(b.key));
  }

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('/i18n/menu-translations.json');
      if (!response.ok) throw new Error('Could not load the bundled menu language file.');
      const catalog = await response.json() as { languages?: Record<string, MenuCatalogEntry>; languageNames?: string[] };
      this.languages = catalog.languages ?? {};
      this.languageNames = catalog.languageNames ?? Object.keys(this.languages);
      if (this.activeLanguage !== 'English' && !this.languages[this.activeLanguage]) {
        this.translationsReady.emit({ language: 'English', translations: {} });
      }
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Could not load menu languages.';
    } finally {
      this.isLoading = false;
    }
  }

  ngOnChanges(): void {
    this.selectedLanguage = this.activeLanguage;
  }

  onLanguageChange(language: string): void {
    this.selectedLanguage = language;
    this.applyLanguage();
  }

  chooseLanguage(language: string): void {
    this.languageSearch = '';
    this.isLanguageListOpen = false;
    this.onLanguageChange(language);
  }

  applyLanguage(): void {
    const language = this.selectedLanguage.trim();
    if (!language || this.isLoading) return;
    this.error = '';
    if (language.toLowerCase() === 'english') {
      this.translationsReady.emit({ language: 'English', translations: {} });
      return;
    }
    const entry = this.languages[language];
    if (!entry) {
      this.error = 'That language is not included in the bundled menu catalog yet.';
      return;
    }
    const translations: Record<string, string> = { ...entry.labels };
    entry.tools.forEach((label, index) => translations[`tool-${index}`] = label);
    const missingLabel = this.labels.find((label) => !translations[label.id]);
    if (missingLabel) {
      this.error = `The ${language} menu catalog is missing “${missingLabel.label}”.`;
      return;
    }
    this.translationsReady.emit({ language, translations });
  }
}

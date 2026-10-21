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
  isLoading = true;
  error = '';
  languages: Record<string, MenuCatalogEntry> = {};

  async ngOnInit(): Promise<void> {
    try {
      const response = await fetch('/i18n/menu-translations.json');
      if (!response.ok) throw new Error('Could not load the bundled menu language file.');
      const catalog = await response.json() as { languages?: Record<string, MenuCatalogEntry> };
      this.languages = catalog.languages ?? {};
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

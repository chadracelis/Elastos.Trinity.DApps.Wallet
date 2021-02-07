import { Component, OnInit, NgZone, ViewChild, ElementRef } from '@angular/core';
import { NavParams, Events, IonSlides } from '@ionic/angular';
import { Native } from '../../../../services/native.service';
import { WalletManager } from '../../../../services/wallet.service';
import { Config } from '../../../../config/Config';
import { Util } from '../../../../model/Util';
import { LocalStorage } from '../../../../services/storage.service';
import { ActivatedRoute } from '@angular/router';
import { WalletCreationService, SelectableMnemonic } from 'src/app/services/walletcreation.service';
import { AppService } from 'src/app/services/app.service';
import { TranslateService } from '@ngx-translate/core';
import QRCode from 'easyqrcodejs';

declare let titleBarManager: TitleBarPlugin.TitleBarManager;

@Component({
    selector: 'app-mnemonic-create',
    templateUrl: './mnemonic-create.page.html',
    styleUrls: ['./mnemonic-create.page.scss'],
})
export class MnemonicCreatePage implements OnInit {

    @ViewChild('slider', {static: false}) slider: IonSlides;
    @ViewChild('qrcode', { static: false }) qrcode: ElementRef;

    public slideIndex = 0;
    public slideOpts = {
        initialSlide: 0,
        speed: 400,
        centeredSlides: true,
        slidesPerView: 1
    };

    masterWalletId: string = "1";
    mnemonicList: SelectableMnemonic[] = [];
    mnemonicStr: string;

    constructor(
        public route: ActivatedRoute,
        public walletManager: WalletManager,
        public native: Native,
        public localStorage: LocalStorage,
        public events: Events,
        public zone: NgZone,
        private walletCreationService: WalletCreationService,
        private appService: AppService,
        private translate: TranslateService
    ) {
        native.showLoading().then(() => {
            this.init();
        });
    }

    ngOnInit() {
    }

    ionViewWillEnter() {
        this.appService.setBackKeyVisibility(true);
        // titleBarManager.setBackgroundColor('#732cd0');
        titleBarManager.setBackgroundColor('#6B26C6');
        titleBarManager.setForegroundMode(TitleBarPlugin.TitleBarForegroundMode.LIGHT);
        titleBarManager.setTitle(this.translate.instant('mnemonic'));
        this.getActiveSlide();
    }

    async init() {
        this.masterWalletId = Util.uuid(6, 16);
        this.mnemonicStr = await this.walletManager.spvBridge.generateMnemonic(this.native.getMnemonicLang());
        this.createQrCode();
        this.native.hideLoading();
        const mnemonicArr = this.mnemonicStr.split(/[\u3000\s]+/);
        this.zone.run(() => {
            for (var i = 0; i < mnemonicArr.length; i++) {
                this.mnemonicList.push({ text: mnemonicArr[i], selected: false });
            }
        });
    }

    async getActiveSlide() {
        this.slideIndex = await this.slider.getActiveIndex();
    }

    nextSlide() {
        this.slider.slideNext();
    }

    prevSlide() {
        this.slider.slidePrev();
    }

    createQrCode() {
        const options = {
          // Basic
          text: this.mnemonicStr,
          width: 200,
          height: 200,
          colorDark : "#000000",
          colorLight : "#ffffff",
          correctLevel : QRCode.CorrectLevel.L,
          // QR Styling
          dotScale: 1.0,
          PO: 'rgb(25, 26, 47)',
          // Background Img
          // logo: '/assets/icon/elastos.svg',
          // backgroundImage: '/assets/icon/elastos.svg',
          backgroundImageAlpha: 1,
          // Outer Zone
          quietZone: 0,
          quietZoneColor: 'transparent',
        };

        try {
            new QRCode(this.qrcode.nativeElement, options);
        } catch (e) {
            console.warn("Exception in setTimeout", e);
        }
    }

    print() {
        const convertedEl = this.qrcode.nativeElement as HTMLElement;
        const canvas = this.qrcode.nativeElement.children[0] as HTMLCanvasElement;
        console.log("Converted element", convertedEl);
        console.log("children", convertedEl.children);

        const options: PrinterPlugin.PrintOptions = {
          name: 'MyDocument',
          orientation: "portrait",
          monochrome: true
        };

        try {
            window.cordova.plugins.printer.print(
              "<div style='height: 100%; padding: 0 20px; display: flex; flex-direction: column; justify-content: center; align-items: center;'><ion-label style='margin-bottom: 25px; font-size: 32px; font-weight: 700;'>KEEP THIS PRIVATE!</ion-label><div style='width: 100%; border: 3px solid #000000; border-radius: 17px; padding: 40px 20px; display: flex; flex-direction: column; justify-content: center; align-items: center;'><img src='data:image/png;base64,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'><h1 style='margin: 40px 0 12.5px; text-align: center; font-family: 'Montserrat'; font-size: 20px; font-weight: 700; letter-spacing: -0.5px;'>Elastos Wallet</h1><img src = '"+canvas.toDataURL()+"'/><p style='margin-top: 25px; padding: 0 120px; text-align: center; font-family: 'Montserrat'; font-size: 13px; font-weight: 500; letter-spacing: -0.5px;'>" + this.mnemonicStr + "</p></div></div>",
              options, (wasPrinted) => {
              console.log("Document printed successfully?", wasPrinted);
            });
          } catch (e) {
            console.warn("Exception in html2canvas", e);
        }
    }

    goToMnemonicWrite() {
        this.walletCreationService.masterId = this.masterWalletId;
        this.walletCreationService.mnemonicStr = this.mnemonicStr;
        this.walletCreationService.mnemonicList = this.mnemonicList;

        // this.walletCreationService.mnemonicPassword = this.mnemonicPassword;

        this.native.go("/mnemonic-write");
    }
}


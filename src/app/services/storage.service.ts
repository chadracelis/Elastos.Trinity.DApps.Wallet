import { Injectable } from '@angular/core';
import { WalletID, ExtendedWalletInfo } from '../model/wallets/MasterWallet';

declare let appManager: AppManagerPlugin.AppManager;

/***
 * Local storage using app manager settings ot make sure debug (CLI) and no debug app versions share the same
 * data.
 */
@Injectable()
export class LocalStorage {
    constructor() { }

    public add(key: string, value: any): any {
        return this.get(key).then((val) => {
            let id = value['id'];
            if (val === null) {
                let initObj = {};
                initObj[id] = value;
                return this.set(key, JSON.stringify(initObj));
            }
            let addObj = JSON.parse(val);
            addObj[id] = value;
            return this.set(key, JSON.stringify(addObj));
        });
    }

    public set(key: string, value: any): Promise<any> {
        return new Promise((resolve) => {
            appManager.setSetting(key, value, () => {
                resolve();
            });
        });
    }

    public async get(key: string): Promise<any> {
        console.log('Fetching for ' + key + ' in app manager settings');
        return new Promise((resolve) => {
            appManager.getSetting(key, (val) => {
                if (typeof(val) === "string") {
                    val = JSON.parse(val);
                }
                resolve(val);
            }, (err) => {
                // DoesnKey not found in setting
                resolve(null);
            });
        });
    }

    public getVal(key, func) {
        appManager.getSetting(key, (val)=>{
            if (typeof(val) === "string") {
                val = JSON.parse(val);
            }
            func(val);
        }, (err)=>{
            console.error("Get setting error for key "+key, err);
        });
    }

    public saveCurMasterId(value) {
        let key = "cur-masterId";
        return this.set(key, JSON.stringify(value));
    }

    public async getCurMasterId(): Promise<any> {
        return await this.get("cur-masterId");
    }

    public saveMappingTable(obj) {
        let key = "map-table";
        return this.add(key, obj);
    }

    /**
     * Additional wallet info that can't be saved in the SPV SDK, so we save it on the app side.
     * Ex: wallet name given by the user.
     */
    public setExtendedMasterWalletInfo(masterId: WalletID, extendedInfo: ExtendedWalletInfo): Promise<void> {
        let key = "extended-wallet-infos-"+masterId;
        return this.set(key, JSON.stringify(extendedInfo));
    }

    public async getExtendedMasterWalletInfos(masterId: WalletID): Promise<ExtendedWalletInfo> {
        let key = "extended-wallet-infos-"+masterId;
        return await this.get(key);
    }

    public savePublishTxList(obj) {
        let key = "publishTx";
        this.set(key, JSON.stringify(obj));
    }

    public async getPublishTxList(): Promise<any> {
        return await this.get("publishTx");
    }

    public setCurrency(value: string) {
        return this.set("currency", JSON.stringify(value)).then((data) => {
          console.log('Currency stored', data);
        });
    }

    public async getCurrency(): Promise<string> {
        let rawCurrency = await this.get("currency");
        console.log('Found currency stored', rawCurrency);
        return rawCurrency;
    }

    public setCurrencyDisplayPreference(useCurrency: boolean) {
        return this.set('useCurrency', JSON.stringify(useCurrency)).then((data) => {
            console.log('Currency display preference stored', data);
        });
    }

    public async getCurrencyDisplayPreference(): Promise<boolean> {
        let pref = await this.get("useCurrency");
        console.log('User prefers using currency?', pref);
        return pref;
    }

    public setPrice(symbol: string, price: number) {
        return this.set(symbol, JSON.stringify(price)).then((data) => {
          console.log('Ela price stored', data);
        });
    }

    public async getPrice(symbol: string): Promise<number> {
        let rawPrice = await this.get(symbol);
        console.log('Found Ela price stored', rawPrice);
        return rawPrice;
    }
}



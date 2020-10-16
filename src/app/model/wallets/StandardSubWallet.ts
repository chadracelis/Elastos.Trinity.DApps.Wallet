import { MasterWallet } from './MasterWallet';
import { SubWallet, SerializedSubWallet } from './SubWallet';
import { CoinType, Coin, StandardCoinName } from '../Coin';
import { Util } from '../Util';
import { AllTransactions, RawTransactionType, Transaction, TransactionDirection, TransactionInfo, TransactionType } from '../Transaction';
import { Transfer } from '../../services/cointransfer.service';
import { Config } from '../../config/Config';
import BigNumber from 'bignumber.js';
import moment from 'moment';
import { TranslateService } from '@ngx-translate/core';
import { CurrencyService } from 'src/app/services/currency.service';

declare let appManager: AppManagerPlugin.AppManager;

export abstract class StandardSubWallet extends SubWallet {
    constructor(masterWallet: MasterWallet, id: StandardCoinName) {
        super(masterWallet, id, CoinType.STANDARD);

        this.initialize();
    }

    protected initialize() {
        // this.masterWallet.walletManager.registerSubWalletListener();
        this.initLastBlockInfo();
        this.updateBalance();
    }

    public async destroy() {
        this.masterWallet.walletManager.stopSubWalletSync(this.masterWallet.id, this.id as StandardCoinName);
        await this.masterWallet.walletManager.spvBridge.destroySubWallet(this.masterWallet.id, this.id);

        super.destroy();
    }

    /**
     * Get the last block info from the local data.
     */
    public async initLastBlockInfo() {
        // Get the last block info from the wallet plugin.
        const blockInfo = await this.masterWallet.walletManager.spvBridge.getLastBlockInfo(this.masterWallet.id, this.id);

        if (blockInfo) this.updateSyncProgress(0, blockInfo.Timestamp);
    }

    public async createAddress(): Promise<string> {
        return await this.masterWallet.walletManager.spvBridge.createAddress(this.masterWallet.id, this.id);
    }

    public getFriendlyName(): string {
        const coin = this.masterWallet.coinService.getCoinByID(this.id);
        if (!coin) {
            return ''; // Just in case
        }

        return coin.getDescription();
    }

    public getDisplayTokenName(): string {
        const coin = this.masterWallet.coinService.getCoinByID(this.id);
        if (!coin) {
            return ''; // Just in case
        }

        return coin.getName();
    }

    public getDisplayBalance(): BigNumber {
        return this.getDisplayAmount(this.balance);
    }

    public getDisplayAmount(amount: BigNumber): BigNumber {
        return amount.dividedBy(Config.SELAAsBigNumber);
    }

    public getAmountInExternalCurrency(value: BigNumber): BigNumber {
        return CurrencyService.instance.getCurrencyBalance(value);
    }

    /**
     * Check whether the balance is enough.
     * @param amount unit is ELA
     */
    public isBalanceEnough(amount: BigNumber) {
        return this.balance.gt(amount.multipliedBy(Config.SELAAsBigNumber));
    }

    public async getTransactions(startIndex: number): Promise<AllTransactions> {
        let allTransactions = await this.masterWallet.walletManager.spvBridge.getAllTransactions(this.masterWallet.id, this.id, startIndex, '');
        console.log("Get all transaction count for coin "+this.id+": ", allTransactions && allTransactions.Transactions ? allTransactions.Transactions.length : -1, "startIndex: ", startIndex);
        return allTransactions;
    }

    protected async getTransactionName(transaction: Transaction, translate: TranslateService): Promise<string> {
        let transactionName: string = '';
        console.log("getTransactionName std subwallet", transaction);

        switch (transaction.Direction) {
            case TransactionDirection.RECEIVED:
                transactionName = translate.instant('coin-op-received-ela');
                // TODO: upgrade spvsdk, check the ETHSC
                switch (transaction.Type) {
                    case RawTransactionType.RechargeToSideChain:
                        transactionName = translate.instant("coin-dir-from-mainchain");
                        break;
                    case RawTransactionType.WithdrawFromSideChain:
                        switch (transaction.TopUpSidechain) {
                            case StandardCoinName.IDChain:
                                transactionName = translate.instant("coin-dir-from-idchain");
                                break;
                            case StandardCoinName.ETHSC:
                                transactionName = translate.instant("coin-dir-from-ethsc");
                                break;
                            default:
                                transactionName = translate.instant('coin-op-received-ela');
                        }
                        break;
                }
                break;
            case TransactionDirection.SENT:
                transactionName = translate.instant("coin-op-sent-ela");

                if (transaction.Type === RawTransactionType.TransferCrossChainAsset) {
                    switch (transaction.TopUpSidechain) {
                        case StandardCoinName.IDChain:
                            transactionName = translate.instant("coin-dir-to-idchain");
                            break;
                        case StandardCoinName.ETHSC:
                            transactionName = translate.instant("coin-dir-to-ethsc");
                            break;
                        default:
                            transactionName = translate.instant("coin-dir-to-mainchain");
                            break;
                    }
                }
                break;
        }
        return transactionName;
    }

    protected async getTransactionIconPath(transaction: Transaction): Promise<string> {
        if (transaction.Direction === TransactionDirection.RECEIVED) {
            switch (transaction.Type) {
                case RawTransactionType.RechargeToSideChain:
                case RawTransactionType.WithdrawFromSideChain:
                case RawTransactionType.TransferCrossChainAsset:
                    return './assets/buttons/transfer.png';
                default:
                    return './assets/buttons/receive.png';
            }
        } else if (transaction.Direction === TransactionDirection.SENT) {
            switch (transaction.Type) {
                case RawTransactionType.RechargeToSideChain:
                case RawTransactionType.WithdrawFromSideChain:
                case RawTransactionType.TransferCrossChainAsset:
                    return './assets/buttons/transfer.png';
                default:
                    return './assets/buttons/send.png';
            }
        } else if (transaction.Direction === TransactionDirection.MOVED) {
            return './assets/buttons/transfer.png';
        }

        // In case the transaction type is a cross chain transfer, we don't mind the direction, we show
        // a transfer icon
        /*if (transaction.Type == RawTransactionType.TransferCrossChainAsset) {
            payStatusIcon = './assets/buttons/transfer.png';
        }*/

        return null;
    }

    protected isVoteTransaction(txId: string): Promise<any> {
        return new Promise(async (resolve) => {
            const transactions = await this.masterWallet.walletManager.spvBridge.getAllTransactions(this.masterWallet.id, this.id, 0, txId);
            const transaction = transactions.Transactions[0];
            if (!Util.isNull(transaction.OutputPayload) && (transaction.OutputPayload.length > 0)) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    }

   /*
    * Updates current SPV synchonization progress information for this coin.
    */
   public updateSyncProgress(progress: number, lastBlockTime: number) {
        if (lastBlockTime) {
            const userReadableDateTime = Util.dateFormat(new Date(lastBlockTime * 1000), 'YYYY-MM-DD HH:mm:ss');
            this.lastBlockTime = userReadableDateTime;
        } else { // for ETHSC, no lastBlockTime
            this.lastBlockTime = '';
        }
        this.progress = progress;

        console.log("Standard subwallet "+this.id+" got update sync progress request. Progress = "+progress);

        const curTimestampMs = (new Date()).getTime();
        const timeInverval = curTimestampMs - this.timestamp;
        if (timeInverval > 5000) { // 5s
            this.masterWallet.walletManager.events.publish(this.masterWallet.id + ':' + this.id + ':syncprogress', this.id);
            this.timestamp = curTimestampMs;
        }

        // Save wallet info every 30 minutes
        // TODO: if spvsdk can get progress by api, then we can delete it
        if (timeInverval > 1800000) { // 30 minutes
            this.masterWallet.walletManager.saveMasterWallet(this.masterWallet);
        }

        if (progress === 100) {
            const eventId = this.masterWallet.id + ':' + this.id + ':synccompleted';
            this.masterWallet.walletManager.events.publish(eventId, this.id);
        }
    }

    /**
     * Signs raw transaction and sends the signed transaction to the SPV SDK for publication.
     */
    public async signAndSendRawTransaction(transaction: string, transfer: Transfer): Promise<void> {
        return new Promise(async (resolve)=>{
            console.log('Received raw transaction', transaction);
            let password = await this.masterWallet.walletManager.openPayModal(transfer);
            if (!password) {
                console.log("No password received. Cancelling");
                await this.masterWallet.walletManager.sendIntentResponse(transfer.action,
                    { txid: null, status: 'cancelled' }, transfer.intentId);
                resolve(null);
                return;
            }

            console.log("Password retrieved. Now signing the transaction.");

            await this.masterWallet.walletManager.native.showLoading();

            const signedTx = await this.masterWallet.walletManager.spvBridge.signTransaction(
                this.masterWallet.id,
                this.id,
                transaction,
                password
            );

            console.log("Transaction signed. Now publishing.");

            const publishedTransaction =
            await this.masterWallet.walletManager.spvBridge.publishTransaction(
                this.masterWallet.id,
                this.id,
                signedTx
            );

            this.masterWallet.walletManager.setRecentWalletId(this.masterWallet.id);

            if (!Util.isEmptyObject(transfer.action)) {
                console.log("Mode: transfer with intent action");
                this.masterWallet.walletManager.lockTx(publishedTransaction.TxHash);

                setTimeout(async () => {
                    let status = 'published';
                    let txId = publishedTransaction.TxHash;
                    const code = this.masterWallet.walletManager.getTxCode(txId);
                    if (code !== 0) {
                        txId = null;
                        status = 'error';
                    }
                    this.masterWallet.walletManager.native.hideLoading();
                    this.masterWallet.walletManager.native.toast_trans('transaction-has-been-published');
                    console.log('Sending intent response', transfer.action, { txid: txId }, transfer.intentId);
                    await this.masterWallet.walletManager.sendIntentResponse(transfer.action,
                        { txid: txId, status }, transfer.intentId);
                    appManager.close();

                    resolve();
                }, 5000); // wait for 5s for txPublished
            } else {
                console.log("Published transaction id:", publishedTransaction.TxHash);

                await this.masterWallet.walletManager.native.hideLoading();
                this.masterWallet.walletManager.native.toast_trans('transaction-has-been-published');
                await this.masterWallet.walletManager.native.setRootRouter('/wallet-home');

                resolve();
            }
        });
    }
}

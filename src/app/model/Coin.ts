import { NetworkType } from './NetworkType';

export type CoinID = string; // ELA, IDChain, ERC1, ERC2...

export enum CoinType {
    STANDARD = "STANDARD", // For ELA, IDChain, ETHSC
    ERC20 = "ERC20" // For ERC20 tokens
}

export enum StandardCoinName {
    ELA = 'ELA',
    IDChain = 'IDChain',
    ETHSC = 'ETHSC'
}

export namespace StandardCoinName {
    export function fromCoinID(coinID: CoinID): StandardCoinName {
        console.log("debug fromCoinID ", coinID)
        return StandardCoinName[coinID];
    }
}

export class Coin {
    constructor(
        private type: CoinType,
        private id: CoinID,
        private name: string,
        private description: string,
        private removable: boolean,
        public network: NetworkType,
        public isCustom: boolean
    ) {}

    public getType(): CoinType {
        return this.type;
    }

    public getID(): CoinID {
        return this.id;
    }

    public getName(): string {
        return this.name;
    }

    public getDescription(): string {
        return this.description;
    }

    public canBeRemoved(): boolean {
        return this.removable;
    }
}

export class StandardCoin extends Coin {
    constructor(id: CoinID, name: string, description: string) {
        // Null network means that the coin is available on all networks
        super(CoinType.STANDARD, id, name, description, false, null, false);
    }
}

export class ERC20Coin extends Coin {

    constructor(
        id: CoinID,
        name: string,
        description: string,
        private erc20ContractAddress: string,
        network: NetworkType,
        isCustom: boolean = false,
    ) {
        super(CoinType.ERC20, id, name, description, true, network, isCustom);
    }

    /**
     * Returns the Ethereum sidechain smart contract address for this coin.
     * Used to operate this coin (balance, transfer, etc).
     */
    getContractAddress(): string {
        return this.erc20ContractAddress;
    }

    static fromJson(jsonCoin: any): ERC20Coin {
        let coin = new ERC20Coin(null, null, null, null, null);
        Object.assign(coin, jsonCoin);
        return coin;
    }
}
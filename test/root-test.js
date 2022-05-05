const dpack = require('@etherpacks/dpack')
const hh = require('hardhat')
const ethers = hh.ethers
const { b32, fail, revert, send, snapshot, wait, want } = require('minihat')

const {expectEvent, padRight, check_gas, check_entry} = require('./utils/helpers')
const {bounds} = require("./bounds");
const debug = require('debug')('dmap:test')
const constants = ethers.constants

describe('rootzone', ()=>{
    let dmap
    let rootzone
    let freezone

    let ali, bob, cat
    let ALI, BOB, CAT

    const zone1 = '0x' + '0'.repeat(38) + '11'
    const zone2 = '0x' + '0'.repeat(38) + '12'

    const delay_period = 60 * 60 * 31
    const LOCK = `0x${'00'.repeat(31)}01`

    function getCommitment (name, zone, salt=b32('salt')) {
        const types = [ "bytes32", "bytes32", "address" ]
        const encoded = ethers.utils.defaultAbiCoder.encode(types, [ salt, name, zone ])
        return hh.ethers.utils.keccak256(encoded)
    }

    let rm_type, rm

    before(async ()=>{
        [ali, bob, cat] = await ethers.getSigners();
        [ALI, BOB, CAT] = [ali, bob, cat].map(x => x.address)

        await hh.run('dmap-mock-deploy')
        const dapp = await dpack.load(require('../pack/dmap_full_hardhat.dpack.json'), hh.ethers, ali)
        dmap = dapp.dmap
        rootzone = dapp.rootzone
        freezone = dapp.freezone
        rm_type = await ethers.getContractFactory('RootMine', ali)
        rm = await rm_type.deploy(rootzone.address)
        await snapshot(hh)
    })

    beforeEach(async ()=>{
        await revert(hh)
    })

    it('init', async () => {
        const mark = getCommitment(b32('free'), freezone.address)
        const filters = [
            rootzone.filters.Hark(mark),
            rootzone.filters.Etch('0x' + b32('free').toString('hex'), freezone.address),
        ]
        for (const f of filters) {
            const res = await rootzone.queryFilter(f)
            want(res.length).to.eql(1)
            debug(res[0].event, res[0].args)
        }
        want(await rootzone.dmap()).to.eql(dmap.address)
        want(Number(await rootzone.last())).to.be.greaterThan(0)
        want(await rootzone.mark()).to.eql(mark)
        await check_entry(dmap, rootzone.address, b32('zone1'), constants.HashZero, constants.HashZero)
        await check_entry(dmap, rootzone.address, b32('zone2'), constants.HashZero, constants.HashZero)
    })

    it('cooldown', async ()=>{
        const commitment = getCommitment(b32('zone1'), zone1)
        await fail('ErrPending', rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        await wait(hh, 60 * 60 * 30)
        await fail('ErrPending', rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        await wait(hh, 60 * 60)
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        await check_entry(dmap, rootzone.address, b32('zone1'), constants.HashZero, constants.HashZero)
    })

    it('fee', async ()=>{
        await wait(hh, delay_period)
        const aliStartBalance = await ali.getBalance()
        const commitment = getCommitment(b32('zone1'), zone1)
        await fail('ErrPayment', rootzone.hark, commitment)
        await fail('ErrPayment', rootzone.hark, commitment, { value: ethers.utils.parseEther('0.9') })
        await fail('ErrPayment', rootzone.hark, commitment, { value: ethers.utils.parseEther('1.1') })
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        const aliEndBalance = await ali.getBalance()
        want((aliStartBalance.sub(ethers.utils.parseEther('1.0'))).gt(aliEndBalance)).true
        want((aliStartBalance.sub(ethers.utils.parseEther('1.5'))).lt(aliEndBalance)).true
        await check_entry(dmap, rootzone.address, b32('zone1'), constants.HashZero, constants.HashZero)
    })

    it('etch fail wrong hash', async ()=>{
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        await fail('ErrExpired', rootzone.etch, b32('wrong_salt'), b32('zone1'), zone1)
        await send(rootzone.etch, b32('salt'), b32('zone1'), zone1)
        await check_entry(dmap, rootzone.address, b32('zone1'), LOCK, padRight(zone1))
    })

    it('error priority', async () => {
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })

        // pending, payment, receipt
        await fail('ErrPending', rootzone.hark, commitment, { value: ethers.utils.parseEther('0.9') })
        // payment, receipt
        await wait(hh, delay_period)
        await fail('ErrPayment', rootzone.hark, commitment, { value: ethers.utils.parseEther('0.9') })

        // receipt
        await hh.network.provider.send(
            "hardhat_setCoinbase", [rootzone.address] // not payable
        )
        await fail('ErrReceipt', rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
    })

    it('etch fail rewrite zone', async ()=>{
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('free'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        await fail('LOCK', rootzone.etch, b32('salt'), b32('free'), zone1)
        await check_entry(dmap, rootzone.address, b32('zone1'), constants.HashZero, constants.HashZero)
    })

    it('state updates', async ()=>{
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })

        await wait(hh, delay_period)
        const newCommitment = getCommitment(b32('zone2'), zone2)
        await send(rootzone.hark, newCommitment, { value: ethers.utils.parseEther('1') })

        await fail('ErrExpired', rootzone.etch, b32('salt'), b32('zone1'), zone1)
        await send(rootzone.etch, b32('salt'), b32('zone2'), zone2)

        await check_entry(dmap, rootzone.address, b32('zone1'), constants.HashZero, constants.HashZero)
        await check_entry(dmap, rootzone.address, b32('zone2'), LOCK, padRight(zone2))
    })

    it('Hark event', async () => {
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        const rx = await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        expectEvent(rx, "Hark", [commitment])
    })

    it('Etch event', async () => {
        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
        const rx = await send(rootzone.etch, b32('salt'), b32('zone1'), zone1)
        expectEvent(rx, "Etch", ['0x' + b32('zone1').toString('hex'), zone1])
        await check_entry(dmap, rootzone.address, b32('zone1'), LOCK, padRight(zone1))
    })

    it('coinbase recursive callback', async () => {
        const mc_type = await ethers.getContractFactory('RecursiveCoinbase', ali)
        const mc = await mc_type.deploy()
        await hh.network.provider.send(
            "hardhat_setCoinbase", [mc.address]
        )

        await wait(hh, delay_period)
        const commitment = getCommitment(b32('zone1'), zone1)
        await send(rootzone.hark, commitment, {value: ethers.utils.parseEther('1')})
        want(await rootzone.mark()).to.eql(commitment)
    })

    const fillores = (m, n) => {
        let ores = []
        for (let i = m; i < n; i++) {
            const ore = {
                salt: ethers.utils.hexZeroPad(i, 32),
                name: ethers.utils.hexZeroPad(i, 32),
                zone: ethers.utils.hexZeroPad(i, 20)
            }
            ores.push(ore)
        }
        return ores
    }

    describe('RootMine', () => {
        const ores04 = fillores(0, 4)

        beforeEach(async () => {
            await hh.network.provider.send("hardhat_setCoinbase", [rm.address])
        })

        it('claim between', async () => {
            await wait(hh, delay_period)
            await send(
                rm.drill, ores04, constants.HashZero,
                {value: ethers.utils.parseEther('1'), gasLimit: 30000000}
            )
            await send(rm.claim)
            await wait(hh, delay_period)
            // use block subsidy
            await send(rm.drill, fillores(4, 8), constants.HashZero, {gasLimit: 30000000})
        })

        it('insufficient funds', async () => {
            await wait(hh, delay_period)
            await fail('failed to execute', rm.drill, ores04, constants.HashZero, {gasLimit: 30000000})
            await send(
                rm.drill, ores04, constants.HashZero,
                {value: ethers.utils.parseEther('1'), gasLimit: 30000000}
            )
        })

        it('redrill', async () => {
            await wait(hh, delay_period)
            await send(
                rm.drill, ores04, constants.HashZero,
                {value: ethers.utils.parseEther('1'), gasLimit: 30000000}
            )
            await wait(hh, delay_period)
            // use block subsidy
            await fail('ErrReceipt()', rm.drill, ores04, constants.HashZero, {gasLimit: 30000000})
        })

        it('not coinbase', async () => {
            await hh.network.provider.send("hardhat_setCoinbase", [ALI])
            await wait(hh, delay_period)
            await fail(
                'ERR_COINBASE', rm.drill, fillores(0, 4), constants.HashZero,
                {value: ethers.utils.parseEther('1'), gasLimit: 30000000}
            )
        })

        it('unauthorized', async () => {
            await hh.network.provider.send("hardhat_setCoinbase", [ALI])
            await want(ali.sendTransaction({to: rm.address}))
                .rejectedWith('ERR_UNAUTHORIZED')
            await hh.network.provider.send("hardhat_setCoinbase", [rm.address])
            await want(ali.sendTransaction({to: rm.address}))
                .rejectedWith('ERR_UNAUTHORIZED')
        })

        it('big', async () => {
            let ores = fillores(0, 99)

            await wait(hh, delay_period)
            await fail('call failed to execute', rm.drill, ores, constants.HashZero, {value: 1, gasLimit: 30000000})
            await send(rm.drill, ores, constants.HashZero, {value: ethers.utils.parseEther('1'), gasLimit: 30000000})
            await wait(hh, delay_period)

            const lastore = {
                salt: ethers.utils.hexZeroPad(ores.length, 32),
                name: ethers.utils.hexZeroPad(ores.length, 32),
                zone: ethers.utils.hexZeroPad(ores.length, 20)
            }
            await send(rm.drill, [lastore], constants.HashZero, {gasLimit: 30000000})
            await wait(hh, delay_period)

            ores.push(lastore)
            for (let i = 0; i < ores.length; i++) {
                const ore = ores[i]
                await check_entry(dmap, rootzone.address, ore.name, LOCK, padRight(ore.zone))
            }

            const prevBal = await ali.getBalance()
            const rmBal = await rm.provider.getBalance(rm.address)
            const rx = await send(rm.claim)
            want(await ali.getBalance()).to.eql(
                prevBal.sub(rx.gasUsed.mul(rx.effectiveGasPrice)).add(rmBal)
            )
        }).timeout(100000)
    })

    describe('gas', () => {
        const commitment = getCommitment(b32('zone1'), zone1)
        it('hark', async () => {
            await wait(hh, delay_period)
            const rx = await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
            const bound = bounds.rootzone.hark
            await check_gas(rx.gasUsed, bound[0], bound[1])
        })

        it('etch', async () => {
            await wait(hh, delay_period)
            await send(rootzone.hark, commitment, { value: ethers.utils.parseEther('1') })
            const rx = await send(rootzone.etch, b32('salt'), b32('zone1'), zone1)
            const bound = bounds.rootzone.etch
            await check_gas(rx.gasUsed, bound[0], bound[1])
        })

        it('drill', async () => {
            const ores = fillores(0, 2)
            await hh.network.provider.send("hardhat_setCoinbase", [rm.address])

            const commitment = getCommitment(b32('RootMine'), zone1)
            await wait(hh, delay_period)
            const rx = await send(rm.drill, ores, constants.HashZero, {value: ethers.utils.parseEther('1'), gasLimit: 30000000})
            const bound = bounds.rootcanal.drill
            await check_gas(rx.gasUsed, bound[0], bound[1])


        })
    })
})

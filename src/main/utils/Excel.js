import XLSX from 'xlsx'

class Excel {
    static readFile(file) {
        return XLSX.readFile(file)
    }

    static readFileSync(file) {
        return XLSX.readFile(file)
    }

    static writeFile(workbook, filename) {
        return XLSX.writeFile(workbook, filename)
    }

    static utils = {
        book_new: () => XLSX.utils.book_new(),
        aoa_to_sheet: (data) => XLSX.utils.aoa_to_sheet(data),
        json_to_sheet: (data) => XLSX.utils.json_to_sheet(data),
        sheet_to_json: (sheet) => XLSX.utils.sheet_to_json(sheet),
        sheet_to_csv: (sheet) => XLSX.utils.sheet_to_csv(sheet),
        book_append_sheet: (workbook, sheet, name) => XLSX.utils.book_append_sheet(workbook, sheet, name)
    }
}

export default Excel

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateBulkApplicationDto = exports.BulkApplicantDto = exports.RecordAllotmentDto = exports.CreateApplicationDto = exports.ApplicantCategory = exports.ApplyMethod = void 0;
const class_validator_1 = require("class-validator");
const class_transformer_1 = require("class-transformer");
var ApplyMethod;
(function (ApplyMethod) {
    ApplyMethod["native"] = "native";
    ApplyMethod["pdf"] = "pdf";
})(ApplyMethod || (exports.ApplyMethod = ApplyMethod = {}));
var ApplicantCategory;
(function (ApplicantCategory) {
    ApplicantCategory["individual"] = "individual";
    ApplicantCategory["shareholder"] = "shareholder";
    ApplicantCategory["employee"] = "employee";
})(ApplicantCategory || (exports.ApplicantCategory = ApplicantCategory = {}));
class CreateApplicationDto {
}
exports.CreateApplicationDto = CreateApplicationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "investorProfileId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "ipoId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ApplicantCategory),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "applicantType", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateApplicationDto.prototype, "lots", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateApplicationDto.prototype, "atCutoff", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], CreateApplicationDto.prototype, "bidPrice", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(ApplyMethod),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "applyMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateApplicationDto.prototype, "dataSharingConsent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateApplicationDto.prototype, "consentNoticeVersion", void 0);
class RecordAllotmentDto {
}
exports.RecordAllotmentDto = RecordAllotmentDto;
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], RecordAllotmentDto.prototype, "allottedLots", void 0);
class BulkApplicantDto {
}
exports.BulkApplicantDto = BulkApplicantDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], BulkApplicantDto.prototype, "investorProfileId", void 0);
__decorate([
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], BulkApplicantDto.prototype, "lots", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], BulkApplicantDto.prototype, "atCutoff", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], BulkApplicantDto.prototype, "bidPrice", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsEnum)(ApplicantCategory),
    __metadata("design:type", String)
], BulkApplicantDto.prototype, "applicantType", void 0);
/** Family / group apply — one rail addbulk call for up to 100 applicants. */
class CreateBulkApplicationDto {
}
exports.CreateBulkApplicationDto = CreateBulkApplicationDto;
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBulkApplicationDto.prototype, "ipoId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBulkApplicationDto.prototype, "category", void 0);
__decorate([
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayNotEmpty)(),
    (0, class_validator_1.ArrayMaxSize)(100),
    (0, class_validator_1.ValidateNested)({ each: true }),
    (0, class_transformer_1.Type)(() => BulkApplicantDto),
    __metadata("design:type", Array)
], CreateBulkApplicationDto.prototype, "applicants", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['native']),
    __metadata("design:type", String)
], CreateBulkApplicationDto.prototype, "applyMethod", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateBulkApplicationDto.prototype, "dataSharingConsent", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateBulkApplicationDto.prototype, "consentNoticeVersion", void 0);

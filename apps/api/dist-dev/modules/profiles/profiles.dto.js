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
exports.CreateProfileDto = exports.Depository = exports.Relationship = void 0;
const class_validator_1 = require("class-validator");
var Relationship;
(function (Relationship) {
    Relationship["self"] = "self";
    Relationship["spouse"] = "spouse";
    Relationship["child"] = "child";
    Relationship["parent"] = "parent";
    Relationship["sibling"] = "sibling";
    Relationship["other"] = "other";
})(Relationship || (exports.Relationship = Relationship = {}));
var Depository;
(function (Depository) {
    Depository["NSDL"] = "NSDL";
    Depository["CDSL"] = "CDSL";
})(Depository || (exports.Depository = Depository = {}));
class CreateProfileDto {
}
exports.CreateProfileDto = CreateProfileDto;
__decorate([
    (0, class_validator_1.IsEnum)(Relationship),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "relationship", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "fullName", void 0);
__decorate([
    (0, class_validator_1.Matches)(/^[A-Z]{5}[0-9]{4}[A-Z]$/),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "pan", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "dateOfBirth", void 0);
__decorate([
    (0, class_validator_1.IsEnum)(Depository),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "depository", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "dpId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "clientId", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "bankAccount", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^[A-Z]{4}0[A-Z0-9]{6}$/),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "ifsc", void 0);
__decorate([
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^[\w.\-]+@[\w.\-]+$/),
    __metadata("design:type", String)
], CreateProfileDto.prototype, "upiId", void 0);
